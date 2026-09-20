import { AREA_LABELS, AREA_ORDER, DEFAULT_PRICES } from "@/lib/constants";
import { getSheets, getSpreadsheetId, sheetsConfigured } from "@/lib/sheets/client";
import { canonicalizeSectionId } from "@/lib/tabulador/ids";
import { inferAreaFromSection, rehomeSectionsByNumber, resolveAreaId } from "@/lib/tabulador/xlsx";
import type {
  AreaId,
  AreaSpec,
  DiscountType,
  PaymentMethod,
  PaymentMode,
  PersistedState,
  Promotion,
  Purchase,
  SeatStatus,
  VenueTabulador,
} from "@/lib/types";

async function readRanges(spreadsheetId: string, ranges: string[]): Promise<string[][][]> {
  const sheets = getSheets();
  const result = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
  return (result.data.valueRanges ?? ranges.map(() => ({ values: [] }))).map((block) =>
    (block.values ?? []).map((row) => row.map((cell) => String(cell ?? "").trim())),
  );
}

const AREA_ALIASES: Record<string, AreaId> = {
  pre: "preferente",
  pref: "preferente",
  preferente: "preferente",
  lun: "luneta",
  luneta: "luneta",
  bal: "balcon",
  balcon: "balcon",
  "primer-piso": "primer-piso",
  "segundo-piso": "segundo-piso",
  p1: "primer-piso",
  p2: "segundo-piso",
};

function normalizeAreaKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseAreaId(value: string, sectionId = ""): AreaId | null {
  const raw = value.trim();
  if (!raw && !sectionId) return null;
  const key = normalizeAreaKey(raw);
  if (AREA_ALIASES[key]) return AREA_ALIASES[key];
  const byLabel = AREA_ORDER.find((id) => normalizeAreaKey(AREA_LABELS[id]) === key);
  if (byLabel) return byLabel;
  if ((AREA_ORDER as string[]).includes(key)) return key as AreaId;
  if (sectionId) return resolveAreaId(raw, sectionId);
  return null;
}

function parseSeatStatus(value: string): SeatStatus | null {
  if (value === "unassigned" || value === "available" || value === "held" || value === "sold") {
    return value;
  }
  return null;
}

function buildTabulador(
  rows: string[][],
  officialCapacity: number,
  version: string,
): VenueTabulador | null {
  const data = rows.slice(1).filter((row) => row.some(Boolean));
  if (!data.length) return null;

  const areas = new Map<AreaId, AreaSpec>();
  for (const id of AREA_ORDER) {
    areas.set(id, {
      id,
      name: AREA_LABELS[id],
      colorLabel: AREA_LABELS[id],
      sections: [],
    });
  }

  for (const [, sectionRaw, rowId, seatRaw] of data) {
    const sectionId = canonicalizeSectionId(sectionRaw ?? "");
    const number = Number(seatRaw);
    if (!sectionId || !rowId || !Number.isFinite(number)) continue;
    const areaId = inferAreaFromSection(sectionId);
    const area = areas.get(areaId);
    if (!area) continue;
    let section = area.sections.find((item) => item.id === sectionId);
    if (!section) {
      section = { id: sectionId, name: sectionId, rows: [] };
      area.sections.push(section);
    }
    let row = section.rows.find((item) => item.id === rowId);
    if (!row) {
      row = { id: rowId, seats: [], slots: [] };
      section.rows.push(row);
    }
    if (!row.seats.includes(number)) {
      row.seats.push(number);
      row.slots = [...(row.slots ?? []), { kind: "seat", number }];
    }
  }

  const built = [...areas.values()].filter((area) => area.sections.length);
  if (!built.length) return null;

  return {
    venueName: "Auditorio Nacional",
    venueCity: "Ciudad de México",
    officialCapacity: officialCapacity || 0,
    version: version || "sheets",
    areas: built,
  };
}

function buildPurchases(
  sales: string[][],
  tickets: string[][],
  installments: string[][],
): Purchase[] {
  const ticketRows = tickets.slice(1).filter((row) => row[0]);
  const installmentRows = installments.slice(1).filter((row) => row[0]);
  const purchases: Purchase[] = [];

  for (const row of sales.slice(1)) {
    const [
      id,
      createdAt,
      email,
      phone,
      paymentModeRaw,
      paymentMethodRaw,
      totalRaw,
      paidRaw,
    ] = row;
    if (!id) continue;
    const paymentMode: PaymentMode = paymentModeRaw === "partial" ? "partial" : "total";
    const paymentMethod: PaymentMethod = paymentMethodRaw === "cash" ? "cash" : "card";
    const total = Number(totalRaw) || 0;
    const paid = Number(paidRaw) || 0;
    purchases.push({
      id,
      createdAt: createdAt || new Date().toISOString(),
      customer: { email: email || "", phone: phone || "" },
      paymentMode,
      paymentMethod,
      tickets: ticketRows
        .filter((item) => item[0] === id)
        .map((item) => ({
          id: item[1] || `tkt-${id}-${item[2]}`,
          seatId: item[2],
          holderName: item[3] || "",
          price: Number(item[4]) || 0,
          basePrice: Number(item[4]) || 0,
          promotionName: item[5] || undefined,
        })),
      deposit: paid,
      total,
      paid,
      installments: installmentRows
        .filter((item) => item[0] === id)
        .map((item) => ({
          index: Number(item[1]) || 0,
          date: item[2],
          amount: Number(item[3]) || 0,
          paid: item[4]?.toLowerCase() === "si" || item[4] === "true",
        })),
      reminders: [],
    });
  }

  return purchases;
}

export async function loadStateFromSheets(): Promise<PersistedState | null> {
  if (!sheetsConfigured()) return null;
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) return null;

  const [
    evento,
    tabuladorRows,
    disponibilidad,
    precios,
    promociones,
    ventas,
    boletos,
    parcialidades,
  ] = await readRanges(spreadsheetId, [
    "Evento!A1:D10",
    "Tabulador!A1:D",
    "Disponibilidad!A1:B",
    "Precios!A1:B",
    "Promociones!A1:F",
    "Ventas!A1:J",
    "Boletos!A1:F",
    "Parcialidades!A1:E",
  ]);

  const eventoData = evento[1] ?? [];
  const eventName = eventoData[0] || "";
  const eventDatetime = eventoData[1] || "";
  const officialCapacity = Number(eventoData[2]) || 0;
  const version = eventoData[3] || "sheets";
  const tabuladorRaw = buildTabulador(tabuladorRows, officialCapacity, version);
  const tabulador = tabuladorRaw ? rehomeSectionsByNumber(tabuladorRaw) : null;

  const hasEvent = Boolean(eventName && eventDatetime);
  const hasTabulador = Boolean(tabulador);
  const hasSales = ventas.length > 1;
  const hasStatus = disponibilidad.length > 1;
  if (!hasEvent && !hasTabulador && !hasSales && !hasStatus) return null;

  const seatStatus: Record<string, SeatStatus> = {};
  for (const [id, statusRaw] of disponibilidad.slice(1)) {
    const status = parseSeatStatus(statusRaw);
    if (id && status) seatStatus[id] = status;
  }

  const prices = AREA_ORDER.map((areaId) => ({
    areaId,
    basePrice: DEFAULT_PRICES[areaId],
  }));
  for (const [areaRaw, priceRaw] of precios.slice(1)) {
    const areaId = parseAreaId(areaRaw);
    if (!areaId) continue;
    const basePrice = Number(priceRaw);
    if (!Number.isFinite(basePrice)) continue;
    const current = prices.find((item) => item.areaId === areaId);
    if (current) current.basePrice = basePrice;
  }

  const promotions: Promotion[] = promociones
    .slice(1)
    .filter((row) => row[0] && row[1])
    .map((row) => ({
      id: row[0],
      name: row[1],
      zoneIds: (row[2] || "")
        .split("|")
        .map((item) => parseAreaId(item))
        .filter((item): item is AreaId => Boolean(item)),
      discountType: (row[3] === "fixed" ? "fixed" : "percent") as DiscountType,
      discountValue: Number(row[4]) || 0,
      expiresAt: row[5] || new Date().toISOString(),
    }));

  return {
    event: {
      name: eventName || "Evento",
      datetime: eventDatetime || new Date().toISOString(),
    },
    tabulador: tabulador ?? {
      venueName: "Auditorio Nacional",
      venueCity: "Ciudad de México",
      officialCapacity,
      version,
      areas: [],
    },
    seatStatus,
    prices,
    promotions,
    purchases: buildPurchases(ventas, boletos, parcialidades),
  };
}

export async function readSeatStatusFromSheets(
  spreadsheetId: string,
): Promise<Record<string, SeatStatus>> {
  const [disponibilidad] = await readRanges(spreadsheetId, ["Disponibilidad!A1:B"]);
  const seatStatus: Record<string, SeatStatus> = {};
  for (const [id, statusRaw] of disponibilidad.slice(1)) {
    const status = parseSeatStatus(statusRaw);
    if (id && status) seatStatus[id] = status;
  }
  return seatStatus;
}
