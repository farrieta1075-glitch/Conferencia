import { roundMoney } from "@/lib/format";
import type { PaymentMethod, PaymentRecord, Purchase, ReminderJob, SeatStatus } from "@/lib/types";

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

function installmentQuotas(purchase: Purchase): number[] {
  const items = purchase.installments;
  const total = roundMoney(purchase.total);
  const quotas = items.map((item) => roundMoney(item.originalAmount ?? item.amount));
  if (!items.length) return quotas;
  const sum = roundMoney(quotas.reduce((acc, value) => acc + value, 0));
  if (Math.abs(sum - total) <= 0.009) return quotas;

  const first = roundMoney(Math.min(quotas[0] ?? 0, total));
  const restCount = items.length - 1;
  if (restCount <= 0) return [total];

  let leftover = roundMoney(Math.max(0, total - first));
  const repaired = [first];
  const even = roundMoney(leftover / restCount);
  for (let index = 0; index < restCount; index++) {
    if (index === restCount - 1) {
      repaired.push(leftover);
    } else {
      repaired.push(even);
      leftover = roundMoney(leftover - even);
    }
  }
  return repaired;
}

export function syncInstallmentsToPaid(purchase: Purchase): Purchase {
  if (!purchase.installments.length) return purchase;
  const quotas = installmentQuotas(purchase);
  let credit = roundMoney(purchase.paid);
  const installments = purchase.installments.map((item, index) => {
    const quota = quotas[index] ?? roundMoney(item.originalAmount ?? item.amount);
    if (credit + 0.009 >= quota) {
      credit = roundMoney(credit - quota);
      return { ...item, originalAmount: quota, amount: quota, paid: true };
    }
    if (credit > 0.009) {
      const leftover = roundMoney(quota - credit);
      credit = 0;
      return { ...item, originalAmount: quota, amount: leftover, paid: false };
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

export interface InstallmentPaymentSlice {
  amount: number;
  method: PaymentMethod;
  date: string;
}

export interface InstallmentCoverage {
  expected: number;
  received: number;
  slices: InstallmentPaymentSlice[];
  installment: Purchase["installments"][number];
}

export function installmentCoverages(
  purchase: Purchase,
  options?: { onlyParcialidades?: boolean },
): InstallmentCoverage[] {
  const pool = activePayments(purchase)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((item) => ({ ...item, left: item.amount }));
  let index = 0;
  const rows: InstallmentCoverage[] = [];
  purchase.installments.forEach((installment, installmentIndex) => {
    const expected = roundMoney(installment.originalAmount ?? installment.amount);
    let need = expected;
    const slices: InstallmentPaymentSlice[] = [];
    let lastUsedId = "";
    while (need > 0.009 && index < pool.length) {
      const payment = pool[index];
      const take = roundMoney(Math.min(need, payment.left));
      if (take > 0.009) {
        slices.push({ amount: take, method: payment.method, date: payment.date });
        need = roundMoney(need - take);
        payment.left = roundMoney(payment.left - take);
        lastUsedId = payment.id;
      }
      if (payment.left <= 0.009) index += 1;
    }
    if (options?.onlyParcialidades && installmentIndex === 0) {
      const leftover = index < pool.length ? pool[index] : null;
      if (leftover && leftover.left > 0.009 && leftover.id === lastUsedId) {
        leftover.left = 0;
        index += 1;
      }
      return;
    }
    rows.push({ installment, expected, received: roundMoney(expected - need), slices });
  });
  return rows;
}

export function applyPurchasePayment(
  purchase: Purchase,
  amount: number,
  settleAll = false,
  method?: PaymentMethod,
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
    method: method ?? purchase.paymentMethod,
  };
  return syncInstallmentsToPaid({
    ...purchase,
    paid: settled ? purchase.total : paid,
    paymentMode: settled ? "total" : purchase.paymentMode,
    payments: [...(purchase.payments ?? []), payment],
  });
}
