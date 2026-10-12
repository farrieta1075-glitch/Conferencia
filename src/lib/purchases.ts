import { roundMoney } from "@/lib/format";
import type { PaymentRecord, Purchase, SeatStatus } from "@/lib/types";

export interface PurchasePatch {
  phone?: string;
  email?: string;
  tickets?: { id: string; holderName: string }[];
}

export function remainingBalance(purchase: Purchase): number {
  return roundMoney(Math.max(0, purchase.total - purchase.paid));
}

export function findPurchaseBySeat(purchases: Purchase[], seatId: string): Purchase | undefined {
  return purchases.find((purchase) => purchase.tickets.some((ticket) => ticket.seatId === seatId));
}

export function activePayments(purchase: Purchase): PaymentRecord[] {
  return (purchase.payments ?? []).filter((item) => !item.cancelled);
}

export function purchaseSeatStatus(purchase: Purchase): SeatStatus {
  if (purchase.cancelled) return "available";
  return remainingBalance(purchase) <= 0.009 ? "sold" : "held";
}

export function voidPurchasePayment(purchase: Purchase, paymentId: string, reason: string): Purchase {
  const reasonText = reason.trim();
  if (!reasonText) throw new Error("Indica la razón de la cancelación");
  const target = (purchase.payments ?? []).find((item) => item.id === paymentId && !item.cancelled);
  if (!target) throw new Error("Pago no encontrado");

  const payments = (purchase.payments ?? []).map((item) =>
    item.id === paymentId
      ? {
          ...item,
          cancelled: true,
          cancelReason: reasonText,
          cancelledAt: new Date().toISOString(),
        }
      : item,
  );
  const paid = roundMoney(activePayments({ ...purchase, payments }).reduce((sum, item) => sum + item.amount, 0));
  const cancelled = paid <= 0.009;

  let leftover = target.amount;
  const installments = [...purchase.installments]
    .reverse()
    .map((item) => {
      if (leftover <= 0) return item;
      if (item.paid) {
        leftover = roundMoney(Math.max(0, leftover - item.amount));
        return { ...item, paid: false };
      }
      const nextAmount = roundMoney(item.amount + leftover);
      leftover = 0;
      return { ...item, amount: nextAmount, paid: false };
    })
    .reverse();

  return {
    ...purchase,
    paid,
    cancelled,
    paymentMode: cancelled || paid < purchase.total - 0.009 ? "partial" : "total",
    installments: cancelled ? installments.map((item) => ({ ...item, paid: false })) : installments,
    payments,
  };
}

export function applyPurchasePatch(purchase: Purchase, patch: PurchasePatch): Purchase {
  const tickets = purchase.tickets.map((ticket) => {
    const next = patch.tickets?.find((item) => item.id === ticket.id);
    return next ? { ...ticket, holderName: next.holderName.trim() } : ticket;
  });
  return {
    ...purchase,
    customer: {
      phone: patch.phone?.trim() ?? purchase.customer.phone,
      email: patch.email?.trim() ?? purchase.customer.email,
    },
    tickets,
  };
}

export function applyPurchasePayment(
  purchase: Purchase,
  amount: number,
  settleAll = false,
): Purchase {
  const remaining = remainingBalance(purchase);
  if (remaining <= 0) return purchase;
  const add = settleAll ? remaining : roundMoney(Math.min(Math.max(0, amount), remaining));
  if (add <= 0) return purchase;

  let leftover = add;
  const installments = purchase.installments.map((item) => {
    if (item.paid || leftover <= 0) return item;
    if (leftover + 0.009 >= item.amount) {
      leftover = roundMoney(leftover - item.amount);
      return { ...item, paid: true };
    }
    const reduced = roundMoney(item.amount - leftover);
    leftover = 0;
    return { ...item, amount: reduced };
  });

  const paid = roundMoney(purchase.paid + add);
  const settled = paid >= purchase.total - 0.009;
  const payment: PaymentRecord = {
    id: `pay-${Date.now()}`,
    date: new Date().toISOString(),
    amount: add,
    method: purchase.paymentMethod,
  };
  return {
    ...purchase,
    paid: settled ? purchase.total : paid,
    paymentMode: settled ? "total" : purchase.paymentMode,
    installments: settled ? installments.map((item) => ({ ...item, paid: true })) : installments,
    payments: [...(purchase.payments ?? []), payment],
  };
}
