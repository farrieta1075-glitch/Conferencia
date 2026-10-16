import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { dataCampusOf, parseCampus, type DataCampus } from "@/lib/campus";
import { NO_EMAIL, NO_PHONE } from "@/lib/constants";
import { seatId } from "@/lib/format";
import { purchaseSeatStatus } from "@/lib/purchases";
import { readTab } from "@/lib/sheets/campusRows";
import { getSpreadsheetId, sheetsConfigured } from "@/lib/sheets/client";
import { applySheetsDelta } from "@/lib/sheets/sync";
import { canonicalizeSectionId } from "@/lib/tabulador/ids";
import type { PaymentMethod, Purchase, SeatStatus, Ticket } from "@/lib/types";

export interface CampusSalesImportSummary {
  campus: DataCampus;
  available: number;
  sold: number;
  held: number;
  purchases: number;
  skippedForeign: number;
  skippedInvalid: number;
}

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function headerIndex(headers: string[], keys: string[]): number {
  const wanted = new Set(keys.map(norm));
  return headers.findIndex((header) => wanted.has(norm(header)));
}

export function parsePaymentMethod(value: unknown): PaymentMethod {
  const key = norm(value);
  if (!key) return "other";
  if (key.includes("tarjeta") || key === "card" || key === "tdc" || key === "tdd") return "card";
  if (key.includes("efectivo") || key === "cash") return "cash";
  return "other";
}

export function paymentMethodLabel(method: PaymentMethod): string {
  if (method === "cash") return "Efectivo";
  if (method === "other") return "Otro";
  return "Tarjeta";
}

function parseMoney(value: unknown): number {
  const text = String(value ?? "").replace(/[^0-9.,-]/g, "");
  if (!text) return 0;
  const compact = text.includes(",") && text.includes(".")
    ? text.replace(/,/g, "")
    : text.replace(/,/g, ".");
  const amount = Number(compact);
  return Number.isFinite(amount) ? amount : 0;
}

function parseExcelDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 18, 0, 0)).toISOString();
    }
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, month - 1, day, 18, 0, 0)).toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function dateKey(iso: string): string {
  return iso ? iso.slice(0, 10) : "";
}

function sectionFromZona(raw: unknown): string {
  const text = String(raw ?? "").toUpperCase();
  const match = text.match(/(\d{3,4})/);
  return canonicalizeSectionId(match?.[1] ?? text);
}

function campusFromSheetName(name: string): DataCampus | null {
  const direct = parseCampus(name);
  if (direct && direct !== "ALL") return direct;
  for (const token of String(name).toUpperCase().split(/[^A-Z]+/)) {
    const parsed = parseCampus(token);
    if (parsed && parsed !== "ALL") return parsed;
  }
  return null;
}

function isSoldMark(value: unknown): boolean {
  const key = norm(value);
  return key === "vendido" || key === "si" || key === "sold";
}

function isUnpaid(value: unknown): boolean {
  const key = norm(value);
  return !key || key.includes("nopagado") || key === "apartado" || key === "held";
}

interface SourceRow {
  seat: string;
  sectionId: string;
  rowId: string;
  number: number;
  client: string;
  sold: boolean;
  unpaid: boolean;
  soldAt: string;
  method: PaymentMethod;
  price: number;
}

function mapHeaders(headers: string[]) {
  return {
    zona: headerIndex(headers, ["zona", "seccion", "seccionasiento"]),
    fila: headerIndex(headers, ["fila", "row", "letra"]),
    asiento: headerIndex(headers, ["asiento", "asientos", "butaca", "numero"]),
    cliente: headerIndex(headers, ["cliente", "nombre", "titular"]),
    vendido: headerIndex(headers, ["vendido", "estatus", "estado"]),
    pagado: headerIndex(headers, ["pagadonopagado", "pagado", "estatuspago"]),
    fecha: headerIndex(headers, ["fechadevendido", "fechavendido", "fecha"]),
    forma: headerIndex(headers, ["formadepago", "metododepago", "pago"]),
    precio: headerIndex(headers, ["precioasistente", "precio", "precioticketmaster"]),
  };
}

function parseSheetRows(sheetName: string, matrix: unknown[][]): SourceRow[] {
  if (!matrix.length) return [];
  const headers = (matrix[0] ?? []).map((cell) => String(cell ?? ""));
  const cols = mapHeaders(headers);
  if (cols.zona < 0 || cols.fila < 0 || cols.asiento < 0 || cols.vendido < 0) {
    throw new Error(`La pestaña ${sheetName} no tiene Zona, Fila, Asiento y Vendido`);
  }
  const rows: SourceRow[] = [];
  for (const raw of matrix.slice(1)) {
    const cells = raw as unknown[];
    const sectionId = sectionFromZona(cells[cols.zona]);
    const rowId = String(cells[cols.fila] ?? "").trim().toUpperCase();
    const number = Number(String(cells[cols.asiento] ?? "").replace(/[^\d-]/g, ""));
    if (!sectionId || !rowId || !Number.isFinite(number)) continue;
    const priceCol = cols.precio >= 0 ? cells[cols.precio] : "";
    rows.push({
      seat: seatId(sectionId, rowId, number),
      sectionId,
      rowId,
      number,
      client: String(cols.cliente >= 0 ? cells[cols.cliente] ?? "" : "").trim(),
      sold: isSoldMark(cols.vendido >= 0 ? cells[cols.vendido] : ""),
      unpaid: isUnpaid(cols.pagado >= 0 ? cells[cols.pagado] : ""),
      soldAt: parseExcelDate(cols.fecha >= 0 ? cells[cols.fecha] : ""),
      method: parsePaymentMethod(cols.forma >= 0 ? cells[cols.forma] : ""),
      price: parseMoney(priceCol),
    });
  }
  return rows;
}

function isGenericClient(name: string): boolean {
  const key = norm(name);
  return /^(asistentes?|voluntari[oa]s?|coluntari[oa]s?)$/.test(key);
}

function purchaseId(campus: DataCampus, client: string, soldAt: string, seat?: string): string {
  const digest = createHash("sha1")
    .update(`${campus}|${norm(client)}|${dateKey(soldAt)}|${seat ?? ""}`)
    .digest("hex")
    .slice(0, 12);
  return `imp-${campus.toLowerCase()}-${digest}`;
}

function buildPurchases(campus: DataCampus, rows: SourceRow[]): Purchase[] {
  const groups = new Map<string, SourceRow[]>();
  for (const row of rows) {
    if (!row.sold) continue;
    const key = isGenericClient(row.client)
      ? `${norm(row.client)}|${dateKey(row.soldAt)}|${row.seat}`
      : `${norm(row.client)}|${dateKey(row.soldAt)}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const purchases: Purchase[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    const unpaid = group.every((row) => row.unpaid);
    const methods = new Set(group.map((row) => row.method));
    const paymentMethod = methods.size === 1 ? first.method : "other";
    const id = purchaseId(
      campus,
      first.client,
      first.soldAt,
      isGenericClient(first.client) ? first.seat : undefined,
    );
    const tickets: Ticket[] = group.map((row, index) => ({
      id: `tkt-${id}-${index}`,
      seatId: row.seat,
      holderName: row.client,
      price: row.price,
      basePrice: row.price,
    }));
    const total = tickets.reduce((sum, ticket) => sum + ticket.price, 0);
    const paid = unpaid ? 0 : total;
    const createdAt = first.soldAt || new Date().toISOString();
    purchases.push({
      id,
      createdAt,
      campus,
      customer: { email: NO_EMAIL, phone: NO_PHONE },
      paymentMode: "total",
      paymentMethod,
      tickets,
      deposit: paid,
      total,
      paid,
      installments: [],
      payments:
        paid > 0
          ? [
              {
                id: `pay-${id}`,
                date: createdAt,
                amount: paid,
                method: paymentMethod,
              },
            ]
          : [],
      reminders: [],
    });
  }
  return purchases;
}

async function foreignSeatIds(spreadsheetId: string, campus: DataCampus): Promise<Set<string>> {
  const existing = await readTab(spreadsheetId, "Disponibilidad!A1:Z");
  const foreign = new Set<string>();
  for (const row of existing.slice(1)) {
    const id = row[0];
    const status = (row[1] ?? "").trim().toLowerCase();
    if (!id || !status || status === "unassigned") continue;
    if (dataCampusOf(row[2]) !== campus) foreign.add(id);
  }
  return foreign;
}

export function parseCampusSalesWorkbook(buffer: ArrayBuffer): { campus: DataCampus; rows: SourceRow[] }[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const parsed: { campus: DataCampus; rows: SourceRow[] }[] = [];
  const seen = new Set<DataCampus>();
  for (const sheetName of workbook.SheetNames) {
    const campus = campusFromSheetName(sheetName);
    if (!campus) continue;
    if (seen.has(campus)) {
      throw new Error(`Hay dos pestañas para el campus ${campus}`);
    }
    seen.add(campus);
    const matrix = XLSX.utils.sheet_to_json<(string | number | Date)[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
    });
    parsed.push({ campus, rows: parseSheetRows(sheetName, matrix) });
  }
  if (!parsed.length) {
    throw new Error("No hay pestañas con nombre de campus (TLC, CDMX, …)");
  }
  return parsed;
}

export async function importCampusSalesWorkbook(buffer: ArrayBuffer): Promise<CampusSalesImportSummary[]> {
  if (!sheetsConfigured()) {
    throw new Error("Google Sheets no está configurado");
  }
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) throw new Error("Falta GOOGLE_SHEETS_ID");

  const parsed = parseCampusSalesWorkbook(buffer);
  const summaries: CampusSalesImportSummary[] = [];

  for (const { campus, rows } of parsed) {
    const foreign = await foreignSeatIds(spreadsheetId, campus);
    let skippedForeign = 0;
    let skippedInvalid = 0;
    const usable: SourceRow[] = [];
    const seenSeats = new Set<string>();
    for (const row of rows) {
      if (!row.seat) {
        skippedInvalid += 1;
        continue;
      }
      if (foreign.has(row.seat) || seenSeats.has(row.seat)) {
        skippedForeign += 1;
        continue;
      }
      seenSeats.add(row.seat);
      usable.push(row);
    }

    const purchases = buildPurchases(campus, usable);
    const seatStatus: Record<string, SeatStatus> = {};
    for (const row of usable) {
      if (!row.sold) seatStatus[row.seat] = "available";
    }
    for (const purchase of purchases) {
      const status = purchaseSeatStatus(purchase);
      for (const ticket of purchase.tickets) seatStatus[ticket.seatId] = status;
    }

    await applySheetsDelta({
      campus,
      purchases,
      seatStatus,
      forceSeatStatus: true,
    });

    summaries.push({
      campus,
      available: usable.filter((row) => !row.sold).length,
      sold: purchases.filter((item) => purchaseSeatStatus(item) === "sold").reduce((sum, item) => sum + item.tickets.length, 0),
      held: purchases.filter((item) => purchaseSeatStatus(item) === "held").reduce((sum, item) => sum + item.tickets.length, 0),
      purchases: purchases.length,
      skippedForeign,
      skippedInvalid,
    });
  }

  return summaries;
}
