import type {
  AreaPrice,
  EventConfig,
  PersistedState,
  Promotion,
  Purchase,
  SeatStatus,
  VenueTabulador,
} from "@/lib/types";
import { DEFAULT_CAMPUS, type DataCampus } from "@/lib/campus";
import { remainingBalance } from "@/lib/purchases";
import { listUsers } from "@/lib/auth/users";
import { writeUsersToSheets } from "@/lib/sheets/users";
import { keepOtherCampusRows, readTab, withCampus } from "@/lib/sheets/campusRows";
import { rowSlots, serializeSeatLayout } from "@/lib/tabulador/seats";
import { readSeatStatusFromSheets } from "@/lib/sheets/load";
import {
  ensureTabs,
  getSheets,
  getSpreadsheetId,
  sheetsConfigured,
} from "@/lib/sheets/client";

export interface SheetsDelta {
  event?: EventConfig;
  officialCapacity?: number;
  version?: string;
  prices?: AreaPrice[];
  promotions?: Promotion[];
  purchases?: Purchase[];
  tabulador?: VenueTabulador;
  writeTabulador?: boolean;
  seatPatch?: Record<string, SeatStatus>;
  seatStatus?: Record<string, SeatStatus>;
  writeUsers?: boolean;
  forceSeatStatus?: boolean;
  campus?: DataCampus;
}

function rows(values: (string | number)[][]) {
  return values.map((row) => row.map((cell) => String(cell ?? "")));
}

async function rowCount(spreadsheetId: string, tab: string): Promise<number> {
  const sheets = getSheets();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:A`,
  });
  return result.data.values?.length ?? 0;
}

async function replaceTab(
  spreadsheetId: string,
  tab: string,
  values: (string | number)[][],
  protectIfShrunk = false,
) {
  if (protectIfShrunk) {
    const existing = await rowCount(spreadsheetId, tab);
    if (existing > 200 && values.length < existing * 0.5) {
      throw new Error(
        `Se rechazó sobrescribir ${tab}: la hoja tiene ${existing} filas y el envío solo ${values.length}.`,
      );
    }
  }

  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows(values) },
  });
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tab}!A${values.length + 1}:Z`,
  });
}

async function mergeCampusTab(
  spreadsheetId: string,
  tab: string,
  headers: string[],
  campus: DataCampus,
  dataRows: (string | number)[][],
  protectIfShrunk = false,
) {
  const campusIndex = headers.length - 1;
  const existing = await readTab(spreadsheetId, `${tab}!A1:Z`);
  const others = keepOtherCampusRows(existing, campusIndex, campus);
  const values = [headers, ...others, ...dataRows.map((row) => withCampus(row, campus))];
  await replaceTab(spreadsheetId, tab, values, protectIfShrunk);
}

function purchaseSheets(purchases: Purchase[]) {
  return {
    ventas: purchases.map((purchase) => [
      purchase.id,
      purchase.createdAt,
      purchase.customer.email,
      purchase.customer.phone,
      purchase.paymentMode,
      purchase.paymentMethod,
      purchase.total,
      purchase.paid,
      remainingBalance(purchase),
      purchase.tickets.length,
    ]),
    boletos: purchases.flatMap((purchase) =>
      purchase.tickets.map((ticket) => [
        purchase.id,
        ticket.id,
        ticket.seatId,
        ticket.holderName,
        ticket.price,
        ticket.promotionName ?? "",
      ]),
    ),
    parcialidades: purchases.flatMap((purchase) =>
      purchase.installments.map((item) => [
        purchase.id,
        item.index,
        item.date,
        item.amount,
        item.paid ? "si" : "no",
      ]),
    ),
    pagos: purchases.flatMap((purchase) =>
      (purchase.payments ?? []).map((item) => [
        purchase.id,
        item.id,
        item.date,
        item.amount,
        item.method,
        item.cancelled ? "si" : "no",
        item.cancelReason ?? "",
        item.cancelledAt ?? "",
      ]),
    ),
  };
}

export async function applySheetsDelta(delta: SheetsDelta) {
  if (!sheetsConfigured()) {
    return { ok: false, skipped: true, reason: "Sin credenciales de Google" };
  }
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    return { ok: false, skipped: true, reason: "Falta GOOGLE_SHEETS_ID" };
  }

  await ensureTabs(spreadsheetId);
  const campus = delta.campus ?? DEFAULT_CAMPUS;

  if (delta.event) {
    await mergeCampusTab(spreadsheetId, "Evento", ["nombre", "fecha", "capacidad_oficial", "version_tabulador", "campus"], campus, [
      [
        delta.event.name,
        delta.event.datetime,
        delta.officialCapacity ?? "",
        delta.version ?? "",
      ],
    ]);
  }

  if (delta.prices) {
    await mergeCampusTab(
      spreadsheetId,
      "Precios",
      ["area", "precio_base", "campus"],
      campus,
      delta.prices.map((item) => [item.areaId, item.basePrice]),
    );
  }

  if (delta.writeTabulador && delta.tabulador) {
    const existing = await readTab(spreadsheetId, "Tabulador!A1:Z");
    const others = keepOtherCampusRows(existing, 5, campus);
    const ownCount = Math.max(0, existing.slice(1).length - others.length);
    const looksDefault =
      delta.tabulador.version === "2.0.0" || delta.tabulador.officialCapacity === 9564;
    if (looksDefault && ownCount > 500) {
      throw new Error(
        `Se protegió el tabulador de Google Sheets (${ownCount} filas de ${campus}). No se reemplaza con el recinto por defecto.`,
      );
    }
    await mergeCampusTab(
      spreadsheetId,
      "Tabulador",
      ["area", "seccion", "fila", "asientos", "orden", "campus"],
      campus,
      delta.tabulador.areas.flatMap((area) =>
        area.sections.flatMap((section) =>
          section.rows.map((row) => [
            area.id,
            section.id,
            row.id,
            serializeSeatLayout(rowSlots(row)),
            row.order ?? "",
          ]),
        ),
      ),
    );
  }

  if (delta.seatStatus) {
    await mergeCampusTab(
      spreadsheetId,
      "Disponibilidad",
      ["asiento_id", "estatus", "campus"],
      campus,
      Object.entries(delta.seatStatus),
      !delta.forceSeatStatus,
    );
  } else if (delta.seatPatch && Object.keys(delta.seatPatch).length) {
    const current = await readSeatStatusFromSheets(spreadsheetId, campus);
    for (const [id, status] of Object.entries(delta.seatPatch)) {
      if (status === "unassigned") delete current[id];
      else current[id] = status;
    }
    await mergeCampusTab(
      spreadsheetId,
      "Disponibilidad",
      ["asiento_id", "estatus", "campus"],
      campus,
      Object.entries(current),
      true,
    );
  }

  if (delta.promotions) {
    await mergeCampusTab(
      spreadsheetId,
      "Promociones",
      ["id", "nombre", "zonas", "tipo", "valor", "vigencia", "campus"],
      campus,
      delta.promotions.map((promo) => [
        promo.id,
        promo.name,
        promo.zoneIds.join("|"),
        promo.discountType,
        promo.discountValue,
        promo.expiresAt,
      ]),
    );
  }

  if (delta.purchases) {
    const sheets = purchaseSheets(delta.purchases);
    await mergeCampusTab(
      spreadsheetId,
      "Ventas",
      ["id", "fecha", "correo", "telefono", "modalidad", "metodo", "total", "pagado", "saldo", "boletos", "campus"],
      campus,
      sheets.ventas,
    );
    await mergeCampusTab(
      spreadsheetId,
      "Boletos",
      ["compra_id", "boleto_id", "asiento_id", "titular", "precio", "promocion", "campus"],
      campus,
      sheets.boletos,
    );
    await mergeCampusTab(
      spreadsheetId,
      "Parcialidades",
      ["compra_id", "indice", "fecha", "monto", "pagado", "campus"],
      campus,
      sheets.parcialidades,
    );
    await mergeCampusTab(
      spreadsheetId,
      "Pagos",
      ["compra_id", "pago_id", "fecha", "monto", "metodo", "cancelado", "motivo", "fecha_cancelacion", "campus"],
      campus,
      sheets.pagos,
    );
  }

  if (delta.writeUsers) {
    await writeUsersToSheets(await listUsers());
  }

  return { ok: true, skipped: false, spreadsheetId };
}

export async function syncStateToSheets(
  state: PersistedState,
  options?: { writeTabulador?: boolean; campus?: DataCampus },
) {
  const looksDefault =
    state.event.name === "Conferencia Magistral 2026" && state.tabulador.version === "2.0.0";
  if (looksDefault && !options?.writeTabulador) {
    return { ok: false, skipped: true, reason: "Se rechazó sincronizar el estado por defecto" };
  }
  return applySheetsDelta({
    event: state.event,
    officialCapacity: state.tabulador.officialCapacity,
    version: state.tabulador.version,
    prices: state.prices,
    promotions: state.promotions,
    purchases: state.purchases,
    seatStatus: state.seatStatus,
    tabulador: options?.writeTabulador ? state.tabulador : undefined,
    writeTabulador: options?.writeTabulador,
    campus: options?.campus ?? DEFAULT_CAMPUS,
  });
}
