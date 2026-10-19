import { DEFAULT_CAMPUS } from "@/lib/campus";
import { roundMoney, seatId } from "@/lib/format";
import { paymentMethodLabel, parsePaymentMethod } from "@/lib/import/campusSales";
import { activePayments, findPurchaseBySeat } from "@/lib/purchases";
import { readTab } from "@/lib/sheets/campusRows";
import { getSheets, getSpreadsheetId, sheetsConfigured } from "@/lib/sheets/client";
import { loadStateFromSheets } from "@/lib/sheets/load";
import { canonicalizeSectionId } from "@/lib/tabulador/ids";
import type { PaymentMethod, Purchase } from "@/lib/types";

const TAB = "QRO";

function normName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function headerIndex(headers: string[], keys: string[]): number {
  const wanted = new Set(
    keys.map((key) =>
      key
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, ""),
    ),
  );
  return headers.findIndex((header) =>
    wanted.has(
      header
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, ""),
    ),
  );
}

function sectionFromZona(raw: unknown): string {
  const text = String(raw ?? "").toUpperCase();
  const match = text.match(/(\d{3,4})/);
  return canonicalizeSectionId(match?.[1] ?? text);
}

const MONTHS_DDMMM = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDdMmm(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "numeric",
    timeZone: "America/Mexico_City",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const monthIndex = Number(parts.find((part) => part.type === "month")?.value ?? "0") - 1;
  const month = MONTHS_DDMMM[monthIndex] ?? "";
  return `${day}${month}`;
}

function formatPago(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function sameText(left: unknown, right: unknown): boolean {
  return String(left ?? "").trim() === String(right ?? "").trim();
}

export function formatPurchasePaymentsLine(purchase: Purchase): string {
  const payments = activePayments(purchase).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!payments.length) return "";
  const ticketCount = Math.max(1, purchase.tickets.length);
  const ticketsTotal = purchase.tickets.reduce((sum, ticket) => sum + ticket.price, 0) || purchase.total;
  if (payments[0].amount + 0.009 >= ticketsTotal) return "";
  const parts = payments.map((item) => {
    const share = roundMoney(item.amount / ticketCount);
    return `${formatPago(share)} (${formatDdMmm(item.date)})`;
  });
  return `Apartado con ${parts.join(" + ")}`;
}

function methodCell(purchaseMethod: PaymentMethod, sheetMethod: unknown): string {
  const parsed = parsePaymentMethod(sheetMethod);
  if (parsed === purchaseMethod) return "";
  return paymentMethodLabel(purchaseMethod);
}

export interface QroSheetUpdateSummary {
  rows: number;
  withPayments: number;
  titularDiff: number;
  methodDiff: number;
}

export async function updateQroSheetPayments(): Promise<QroSheetUpdateSummary> {
  if (!sheetsConfigured()) {
    throw new Error("Google Sheets no está configurado");
  }
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) throw new Error("Falta GOOGLE_SHEETS_ID");

  const matrix = await readTab(spreadsheetId, `${TAB}!A1:S`);
  if (!matrix.length) {
    throw new Error("No hay datos en la hoja QRO");
  }

  const headers = matrix[0] ?? [];
  const cols = {
    zona: headerIndex(headers, ["zona", "seccion"]),
    fila: headerIndex(headers, ["fila", "row", "letra"]),
    asiento: headerIndex(headers, ["asiento", "asientos", "butaca", "numero"]),
    cliente: headerIndex(headers, ["cliente", "nombre"]),
    forma: headerIndex(headers, ["formadepago", "metododepago"]),
    comentarios: headerIndex(headers, ["comentarios", "comentario"]),
  };
  if (cols.zona < 0 || cols.fila < 0 || cols.asiento < 0) {
    throw new Error("La hoja QRO no tiene Zona, Fila y Asiento");
  }

  const state = await loadStateFromSheets(DEFAULT_CAMPUS);
  if (!state) throw new Error("No se pudieron leer las compras de QRO");

  const qrs: string[][] = [["Pagos", "Titular", "Método"]];
  let withPayments = 0;
  let titularDiff = 0;
  let methodDiff = 0;

  for (const row of matrix.slice(1)) {
    const sectionId = sectionFromZona(row[cols.zona]);
    const rowId = String(row[cols.fila] ?? "").trim().toUpperCase();
    const number = Number(String(row[cols.asiento] ?? "").replace(/[^\d-]/g, ""));
    if (!sectionId || !rowId || !Number.isFinite(number)) {
      qrs.push(["", "", ""]);
      continue;
    }
    const id = seatId(sectionId, rowId, number);
    const purchase = findPurchaseBySeat(state.purchases, id);
    if (!purchase || purchase.cancelled) {
      qrs.push([row[16] ?? "", row[17] ?? "", row[18] ?? ""]);
      continue;
    }
    const ticket = purchase.tickets.find((item) => item.seatId === id);
    let payments = formatPurchasePaymentsLine(purchase);
    const comentarios = String(row[cols.comentarios >= 0 ? cols.comentarios : 15] ?? "");
    if (payments && sameText(comentarios, payments)) payments = "";
    const holder = ticket?.holderName?.trim() ?? "";
    const cliente = cols.cliente >= 0 ? String(row[cols.cliente] ?? "").trim() : "";
    const titular = holder && normName(holder) !== normName(cliente) ? holder : "";
    const metodo =
      cols.forma >= 0 ? methodCell(purchase.paymentMethod, row[cols.forma]) : paymentMethodLabel(purchase.paymentMethod);
    if (payments) withPayments += 1;
    if (titular) titularDiff += 1;
    if (metodo) methodDiff += 1;
    qrs.push([payments, titular, metodo]);
  }

  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!Q1:S`,
    valueInputOption: "RAW",
    requestBody: { values: qrs },
  });

  return {
    rows: qrs.length - 1,
    withPayments,
    titularDiff,
    methodDiff,
  };
}