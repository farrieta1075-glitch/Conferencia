import type { DataCampus } from "@/lib/campus";
import { applyPurchasePayment, purchaseSeatStatus } from "@/lib/purchases";
import { loadStateFromSheets } from "@/lib/sheets/load";
import { applySheetsDelta } from "@/lib/sheets/sync";
import type { PaymentMethod, Purchase, SeatStatus } from "@/lib/types";

export async function recordPurchasePayment(input: {
  campus: DataCampus;
  id: string;
  amount: number;
  settleAll?: boolean;
  method?: PaymentMethod;
}): Promise<Purchase> {
  const loaded = await loadStateFromSheets(input.campus);
  const purchases = loaded?.state.purchases ?? [];
  const current = purchases.find((item) => item.id === input.id && !item.cancelled);
  if (!current) throw new Error("Compra no encontrada");
  const updated = applyPurchasePayment(current, input.amount, input.settleAll, input.method);
  if (updated.paid <= current.paid + 0.009) {
    throw new Error("La compra no tiene saldo por abonar");
  }
  const next = purchases.map((item) => (item.id === current.id ? updated : item));
  const status = purchaseSeatStatus(updated);
  const seatPatch: Record<string, SeatStatus> = {};
  for (const ticket of updated.tickets) seatPatch[ticket.seatId] = status;
  const saved = await applySheetsDelta({ campus: input.campus, purchases: next, seatPatch });
  if (!saved.ok) {
    const reason = "reason" in saved ? saved.reason : "";
    throw new Error(reason || "No se pudo guardar el pago en Google Sheets");
  }
  return updated;
}
