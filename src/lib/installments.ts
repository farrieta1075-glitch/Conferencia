import type { InstallmentCount, InstallmentPlan } from "./types";
import { roundMoney } from "./format";

const PLANS: InstallmentCount[] = [3, 4, 5, 6];

export function paymentDeadline(eventDateIso: string): Date {
  const deadline = new Date(eventDateIso);
  deadline.setDate(deadline.getDate() - 21);
  deadline.setHours(12, 0, 0, 0);
  return deadline;
}

export function buildInstallmentPlans(
  total: number,
  deposit: number,
  eventDateIso: string,
  now = new Date(),
): InstallmentPlan[] {
  const remaining = roundMoney(Math.max(0, total - deposit));
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  const deadline = paymentDeadline(eventDateIso);

  if (deadline.getTime() <= start.getTime()) return [];

  return PLANS.map((n) => {
    const extraCount = n - 1;
    const extraDates = extraCount
      ? Array.from({ length: extraCount }, (_, index) => {
          const t = (index + 1) / extraCount;
          return new Date(start.getTime() + t * (deadline.getTime() - start.getTime()));
        })
      : [];

    const base = extraCount ? roundMoney(remaining / extraCount) : 0;
    const extras = extraDates.map((date, index) => {
      const amount =
        index === extraDates.length - 1
          ? roundMoney(remaining - base * (extraCount - 1))
          : base;
      return { date: date.toISOString(), amount };
    });

    return {
      n,
      deposit: roundMoney(deposit),
      remaining,
      total,
      payments: [
        { date: now.toISOString(), amount: roundMoney(deposit) },
        ...extras,
      ],
    };
  });
}
