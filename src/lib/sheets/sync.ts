import type {
  AreaPrice,
  EventConfig,
  PersistedState,
  Promotion,
  Purchase,
  SeatStatus,
  VenueTabulador,
} from "@/lib/types";
import { remainingBalance } from "@/lib/purchases";
import { publicUser, listUsers } from "@/lib/auth/users";
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

function disponibilidadValues(seatStatus: Record<string, SeatStatus>) {
  return [
    ["asiento_id", "estatus"],
    ...Object.entries(seatStatus),
  ];
}

function purchaseSheets(purchases: Purchase[]) {
  return {
    ventas: [
      ["id", "fecha", "correo", "telefono", "modalidad", "metodo", "total", "pagado", "saldo", "boletos"],
      ...purchases.map((purchase) => [
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
    ],
    boletos: [
      ["compra_id", "boleto_id", "asiento_id", "titular", "precio", "promocion"],
      ...purchases.flatMap((purchase) =>
        purchase.tickets.map((ticket) => [
          purchase.id,
          ticket.id,
          ticket.seatId,
          ticket.holderName,
          ticket.price,
          ticket.promotionName ?? "",
        ]),
      ),
    ],
    parcialidades: [
      ["compra_id", "indice", "fecha", "monto", "pagado"],
      ...purchases.flatMap((purchase) =>
        purchase.installments.map((item) => [
          purchase.id,
          item.index,
          item.date,
          item.amount,
          item.paid ? "si" : "no",
        ]),
      ),
    ],
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

  if (delta.event) {
    await replaceTab(spreadsheetId, "Evento", [
      ["nombre", "fecha", "capacidad_oficial", "version_tabulador"],
      [
        delta.event.name,
        delta.event.datetime,
        delta.officialCapacity ?? "",
        delta.version ?? "",
      ],
    ]);
  }

  if (delta.prices) {
    await replaceTab(spreadsheetId, "Precios", [
      ["area", "precio_base"],
      ...delta.prices.map((item) => [item.areaId, item.basePrice]),
    ]);
  }

  if (delta.writeTabulador && delta.tabulador) {
    const existing = await rowCount(spreadsheetId, "Tabulador");
    const looksDefault =
      delta.tabulador.version === "2.0.0" || delta.tabulador.officialCapacity === 9564;
    if (looksDefault && existing > 500) {
      throw new Error(
        `Se protegió el tabulador de Google Sheets (${existing} filas). No se reemplaza con el recinto por defecto.`,
      );
    }
    await replaceTab(spreadsheetId, "Tabulador", [
      ["area", "seccion", "fila", "asientos", "orden"],
      ...delta.tabulador.areas.flatMap((area) =>
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
    ]);
  }

  if (delta.seatStatus) {
    await replaceTab(
      spreadsheetId,
      "Disponibilidad",
      disponibilidadValues(delta.seatStatus),
      !delta.forceSeatStatus,
    );
  } else if (delta.seatPatch && Object.keys(delta.seatPatch).length) {
    const current = await readSeatStatusFromSheets(spreadsheetId);
    for (const [id, status] of Object.entries(delta.seatPatch)) {
      if (status === "unassigned") delete current[id];
      else current[id] = status;
    }
    await replaceTab(spreadsheetId, "Disponibilidad", disponibilidadValues(current), true);
  }

  if (delta.promotions) {
    await replaceTab(spreadsheetId, "Promociones", [
      ["id", "nombre", "zonas", "tipo", "valor", "vigencia"],
      ...delta.promotions.map((promo) => [
        promo.id,
        promo.name,
        promo.zoneIds.join("|"),
        promo.discountType,
        promo.discountValue,
        promo.expiresAt,
      ]),
    ]);
  }

  if (delta.purchases) {
    const sheets = purchaseSheets(delta.purchases);
    await replaceTab(spreadsheetId, "Ventas", sheets.ventas);
    await replaceTab(spreadsheetId, "Boletos", sheets.boletos);
    await replaceTab(spreadsheetId, "Parcialidades", sheets.parcialidades);
  }

  if (delta.writeUsers) {
    const users = await listUsers();
    await replaceTab(spreadsheetId, "Usuarios", [
      ["correo", "nombre", "rol", "origen"],
      ...users.map((user) => {
        const pub = publicUser(user);
        return [pub.email, pub.name, pub.role, pub.source];
      }),
    ]);
  }

  return { ok: true, skipped: false, spreadsheetId };
}

export async function syncStateToSheets(
  state: PersistedState,
  options?: { writeTabulador?: boolean },
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
  });
}
