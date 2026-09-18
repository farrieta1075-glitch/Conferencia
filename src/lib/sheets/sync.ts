import type { PersistedState } from "@/lib/types";
import { remainingBalance } from "@/lib/purchases";
import { publicUser, listUsers } from "@/lib/auth/users";
import {
  ensureTabs,
  getSheets,
  getSpreadsheetId,
  sheetsConfigured,
} from "@/lib/sheets/client";

function rows(values: (string | number)[][]) {
  return values.map((row) => row.map((cell) => String(cell ?? "")));
}

async function writeSheet(spreadsheetId: string, range: string, values: (string | number)[][]) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: rows(values) },
  });
}

export async function syncStateToSheets(state: PersistedState) {
  if (!sheetsConfigured()) {
    return { ok: false, skipped: true, reason: "Sin credenciales de Google" };
  }
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    return { ok: false, skipped: true, reason: "Falta GOOGLE_SHEETS_ID" };
  }

  await ensureTabs(spreadsheetId);

  await writeSheet(spreadsheetId, "Evento!A1", [
    ["nombre", "fecha", "capacidad_oficial", "version_tabulador"],
    [
      state.event.name,
      state.event.datetime,
      state.tabulador.officialCapacity,
      state.tabulador.version,
    ],
  ]);

  await writeSheet(spreadsheetId, "Precios!A1", [
    ["area", "precio_base"],
    ...state.prices.map((item) => [item.areaId, item.basePrice]),
  ]);

  await writeSheet(spreadsheetId, "Tabulador!A1", [
    ["area", "seccion", "fila", "asiento"],
    ...state.tabulador.areas.flatMap((area) =>
      area.sections.flatMap((section) =>
        section.rows.flatMap((row) =>
          row.seats.map((number) => [area.id, section.id, row.id, number]),
        ),
      ),
    ),
  ]);

  await writeSheet(spreadsheetId, "Disponibilidad!A1", [
    ["asiento_id", "estatus"],
    ...Object.entries(state.seatStatus),
  ]);

  await writeSheet(spreadsheetId, "Promociones!A1", [
    ["id", "nombre", "zonas", "tipo", "valor", "vigencia"],
    ...state.promotions.map((promo) => [
      promo.id,
      promo.name,
      promo.zoneIds.join("|"),
      promo.discountType,
      promo.discountValue,
      promo.expiresAt,
    ]),
  ]);

  await writeSheet(spreadsheetId, "Ventas!A1", [
    ["id", "fecha", "correo", "telefono", "modalidad", "metodo", "total", "pagado", "saldo", "boletos"],
    ...state.purchases.map((purchase) => [
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
  ]);

  await writeSheet(spreadsheetId, "Boletos!A1", [
    ["compra_id", "boleto_id", "asiento_id", "titular", "precio", "promocion"],
    ...state.purchases.flatMap((purchase) =>
      purchase.tickets.map((ticket) => [
        purchase.id,
        ticket.id,
        ticket.seatId,
        ticket.holderName,
        ticket.price,
        ticket.promotionName ?? "",
      ]),
    ),
  ]);

  await writeSheet(spreadsheetId, "Parcialidades!A1", [
    ["compra_id", "indice", "fecha", "monto", "pagado"],
    ...state.purchases.flatMap((purchase) =>
      purchase.installments.map((item) => [
        purchase.id,
        item.index,
        item.date,
        item.amount,
        item.paid ? "si" : "no",
      ]),
    ),
  ]);

  const users = await listUsers();
  await writeSheet(spreadsheetId, "Usuarios!A1", [
    ["correo", "nombre", "rol", "origen"],
    ...users.map((user) => {
      const pub = publicUser(user);
      return [pub.email, pub.name, pub.role, pub.source];
    }),
  ]);

  return { ok: true, skipped: false, spreadsheetId };
}
