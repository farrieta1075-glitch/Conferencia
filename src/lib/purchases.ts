import { roundMoney } from "@/lib/format";
import type { Purchase, SeatStatus } from "@/lib/types";

export interface PurchasePatch {
  phone?: string;
  email?: string;
  tickets?: { id: string; holderName: string }[];
}

export function remainingBalance(purchase: Purchase): number {
  return roundMoney(Math.max(0, purchase.total - purchase.paid));
}

export function purchaseSeatStatus(purchase: Purchase): SeatStatus {
  return remainingBalance(purchase) <= 0.009 ? "sold" : "held";
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
  return {
    ...purchase,
    paid: settled ? purchase.total : paid,
    paymentMode: settled ? "total" : purchase.paymentMode,
    installments: settled ? installments.map((item) => ({ ...item, paid: true })) : installments,
  };
}
