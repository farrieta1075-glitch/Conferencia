import { AREA_LABELS, AREA_ORDER, DEFAULT_PRICES } from "@/lib/constants";
import { DEFAULT_CAMPUS, type DataCampus } from "@/lib/campus";
import { filterCampusRows } from "@/lib/sheets/campusRows";
import { ensureTabs, getSheets, getSpreadsheetId, sheetsConfigured } from "@/lib/sheets/client";
import { canonicalizeSectionId } from "@/lib/tabulador/ids";
import { inferAreaFromSection, rehomeSectionsByNumber, resolveAreaId } from "@/lib/tabulador/xlsx";
import { looksLikeSeatLayout, seatsFromSlots, tokenizeSeatLayout } from "@/lib/tabulador/seats";
import type {
  AreaId,
  AreaSpec,
  DiscountType,
  PaymentMethod,
  PaymentMode,
  PersistedState,
  Promotion,
  PaymentRecord,
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

  for (const [, sectionRaw, rowId, seatRaw, orderRaw] of data) {
    const sectionId = canonicalizeSectionId(sectionRaw ?? "");
    if (!sectionId || !rowId) continue;
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
    const order = Number(orderRaw);
    if (Number.isFinite(order)) row.order = order;

    if (looksLikeSeatLayout(seatRaw ?? "")) {
      const slots = tokenizeSeatLayout(seatRaw);
      if (slots.length) {
        row.slots = slots;
        row.seats = seatsFromSlots(slots);
      }
      continue;
    }

    const number = Number(seatRaw);
    if (!Number.isFinite(number)) continue;
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
  payments: string[][],
  campus: DataCampus,
): Purchase[] {
  const ticketRows = tickets.slice(1).filter((row) => row[0]);
  const installmentRows = installments.slice(1).filter((row) => row[0]);
  const paymentRows = payments.slice(1).filter((row) => row[0]);
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
    const logged: PaymentRecord[] = paymentRows
      .filter((item) => item[0] === id)
      .map((item) => ({
        id: item[1] || `pay-${id}-${item[2]}`,
        date: item[2],
        amount: Number(item[3]) || 0,
        method: item[4] === "cash" ? "cash" : "card",
        cancelled: String(item[5] ?? "").toLowerCase() === "si",
        cancelReason: item[6] || undefined,
        cancelledAt: item[7] || undefined,
      }));
    const paymentsForPurchase =
      logged.length > 0
        ? logged
        : paid > 0
          ? [
              {
                id: `pay-${id}-inicial`,
                date: createdAt || new Date().toISOString(),
                amount: paid,
                method: paymentMethod,
              },
            ]
          : [];
    purchases.push({
      id,
      createdAt: createdAt || new Date().toISOString(),
      campus,
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
      payments: paymentsForPurchase,
      cancelled: paid <= 0.009 && paymentsForPurchase.length > 0 && paymentsForPurchase.every((item) => item.cancelled),
      reminders: [],
    });
  }

  return purchases;
}

export async function loadStateFromSheets(
  campus: DataCampus = DEFAULT_CAMPUS,
): Promise<PersistedState | null> {
  if (!sheetsConfigured()) return null;
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) return null;
  await ensureTabs(spreadsheetId);

  const [
    evento,
    tabuladorRows,
    disponibilidad,
    precios,
    promociones,
    ventas,
    boletos,
    parcialidades,
    pagos,
  ] = await readRanges(spreadsheetId, [
    "Evento!A1:E",
    "Tabulador!A1:F",
    "Disponibilidad!A1:C",
    "Precios!A1:C",
    "Promociones!A1:G",
    "Ventas!A1:K",
    "Boletos!A1:G",
    "Parcialidades!A1:F",
    "Pagos!A1:I",
  ]);

  const eventoRows = filterCampusRows(evento, 4, campus);
  const eventoData = eventoRows[1] ?? [];
  const eventName = eventoData[0] || "";
  const eventDatetime = eventoData[1] || "";
  const officialCapacity = Number(eventoData[2]) || 0;
  const version = eventoData[3] || "sheets";
  const tabuladorRaw = buildTabulador(filterCampusRows(tabuladorRows, 5, campus), officialCapacity, version);
  const tabulador = tabuladorRaw ? rehomeSectionsByNumber(tabuladorRaw) : null;

  const hasEvent = Boolean(eventName && eventDatetime);
  const hasTabulador = Boolean(tabulador);
  const ventasCampus = filterCampusRows(ventas, 10, campus);
  const disponibilidadCampus = filterCampusRows(disponibilidad, 2, campus);
  const hasSales = ventasCampus.length > 1;
  const hasStatus = disponibilidadCampus.length > 1;
  if (!hasEvent && !hasTabulador && !hasSales && !hasStatus) return null;

  const seatStatus: Record<string, SeatStatus> = {};
  for (const [id, statusRaw] of disponibilidadCampus.slice(1)) {
    const status = parseSeatStatus(statusRaw);
    if (id && status) seatStatus[id] = status;
  }

  const prices = AREA_ORDER.map((areaId) => ({
    areaId,
    basePrice: DEFAULT_PRICES[areaId],
  }));
  for (const [areaRaw, priceRaw] of filterCampusRows(precios, 2, campus).slice(1)) {
    const areaId = parseAreaId(areaRaw);
    if (!areaId) continue;
    const basePrice = Number(priceRaw);
    if (!Number.isFinite(basePrice)) continue;
    const current = prices.find((item) => item.areaId === areaId);
    if (current) current.basePrice = basePrice;
  }

  const promotions: Promotion[] = filterCampusRows(promociones, 6, campus)
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
    purchases: buildPurchases(
      ventasCampus,
      filterCampusRows(boletos, 6, campus),
      filterCampusRows(parcialidades, 5, campus),
      filterCampusRows(pagos, 8, campus),
      campus,
    ),
  };
}

export async function readSeatStatusFromSheets(
  spreadsheetId: string,
  campus: DataCampus = DEFAULT_CAMPUS,
): Promise<Record<string, SeatStatus>> {
  const [disponibilidad] = await readRanges(spreadsheetId, ["Disponibilidad!A1:C"]);
  const seatStatus: Record<string, SeatStatus> = {};
  for (const [id, statusRaw] of filterCampusRows(disponibilidad, 2, campus).slice(1)) {
    const status = parseSeatStatus(statusRaw);
    if (id && status) seatStatus[id] = status;
  }
  return seatStatus;
}
