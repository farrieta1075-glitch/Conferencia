import { roundMoney } from "@/lib/format";
import type { PaymentRecord, Purchase, ReminderJob, SeatStatus } from "@/lib/types";

export interface PurchasePatch {
  phone?: string;
  email?: string;
  tickets?: { id: string; holderName: string }[];
  appendReminder?: ReminderJob;
}

export function remainingBalance(purchase: Purchase): number {
  return roundMoney(Math.max(0, purchase.total - purchase.paid));
}

export function isNamelessBlock(purchase: Purchase): boolean {
  if (purchase.cancelled) return false;
  return purchase.tickets.every((ticket) => !ticket.holderName.trim());
}

export function releaseNamelessBlock(purchase: Purchase): Purchase {
  if (!isNamelessBlock(purchase)) {
    throw new Error("Solo se pueden desbloquear lugares sin nombre");
  }
  return {
    ...purchase,
    cancelled: true,
    paid: 0,
    payments: [
      ...(purchase.payments ?? []),
      {
        id: `pay-release-${Date.now()}`,
        date: new Date().toISOString(),
        amount: 0,
        method: purchase.paymentMethod,
        cancelled: true,
        cancelReason: "Desbloqueo de lugar sin nombre",
        cancelledAt: new Date().toISOString(),
      },
    ],
  };
}

export function syncInstallmentsToPaid(purchase: Purchase): Purchase {
  let credit = roundMoney(purchase.paid);
  const installments = purchase.installments.map((item) => {
    const quota = item.originalAmount ?? item.amount;
    if (credit + 0.009 >= quota) {
      credit = roundMoney(credit - quota);
      return { ...item, originalAmount: quota, amount: quota, paid: true };
    }
    return { ...item, originalAmount: quota, amount: quota, paid: false };
  });
  return { ...purchase, installments };
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
  return syncInstallmentsToPaid({
    ...purchase,
    paid,
    cancelled,
    paymentMode: cancelled || paid < purchase.total - 0.009 ? "partial" : "total",
    payments,
  });
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
    reminders: patch.appendReminder
      ? [...(purchase.reminders ?? []), patch.appendReminder]
      : purchase.reminders ?? [],
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

  const paid = roundMoney(purchase.paid + add);
  const settled = paid >= purchase.total - 0.009;
  const payment: PaymentRecord = {
    id: `pay-${Date.now()}`,
    date: new Date().toISOString(),
    amount: add,
    method: purchase.paymentMethod,
  };
  return syncInstallmentsToPaid({
    ...purchase,
    paid: settled ? purchase.total : paid,
    paymentMode: settled ? "total" : purchase.paymentMode,
    payments: [...(purchase.payments ?? []), payment],
  });
}
