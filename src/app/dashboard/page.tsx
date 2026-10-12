"use client";

import { useMemo, useState } from "react";
import { MiniBarChart, type BarPoint, type BarSeries } from "@/components/MiniBarChart";
import { RoleGate } from "@/components/auth/RoleGate";
import { useCampus } from "@/context/CampusContext";
import { useEventStore } from "@/context/EventStore";
import { formatDate, money } from "@/lib/format";
import { activePayments } from "@/lib/purchases";
import { flattenSeats } from "@/lib/tabulador/generator";
import { priceForSeat } from "@/lib/pricing";
import { addDays, dayLabel, enumerateWeeks, weekLabel, weekStart } from "@/lib/weeks";

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(date);
}

export default function DashboardPage() {
  const { state, statusOf } = useEventStore();
  const { campus } = useCampus();
  const [open, setOpen] = useState<"cashflow" | "methods" | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [cobrosOpen, setCobrosOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);

  const metrics = useMemo(() => {
    const seats = flattenSeats(state.tabulador);
    const foreign = new Set(state.foreignSeats ?? []);
    const counts = { unassigned: 0, available: 0, held: 0, sold: 0 };
    let goalMoney = 0;
    let goalSeats = 0;
    for (const seat of seats) {
      if (foreign.has(seat.id)) continue;
      const status = statusOf(seat.id);
      counts[status] += 1;
      if (status === "unassigned") continue;
      goalSeats += 1;
      goalMoney += priceForSeat(seat, state.prices, state.promotions).price;
    }

    const livePurchases = state.purchases.filter((purchase) => !purchase.cancelled);
    const cobrado = livePurchases.reduce((sum, purchase) => sum + purchase.paid, 0);
    const pendiente = livePurchases.reduce(
      (sum, purchase) => sum + Math.max(0, purchase.total - purchase.paid),
      0,
    );
    const committedSeats = counts.held + counts.sold;

    const byPromo = new Map<string, { tickets: number; amount: number }>();
    for (const purchase of livePurchases) {
      for (const ticket of purchase.tickets) {
        const key = ticket.promotionName ?? "Sin promoción";
        const current = byPromo.get(key) ?? { tickets: 0, amount: 0 };
        current.tickets += 1;
        current.amount += ticket.price;
        byPromo.set(key, current);
      }
    }

    const upcoming = livePurchases
      .flatMap((purchase) =>
        purchase.installments
          .filter((item) => !item.paid)
          .map((item) => ({
            ...item,
            purchaseId: purchase.id,
            email: purchase.customer.email,
            phone: purchase.customer.phone,
            holder: purchase.tickets[0]?.holderName ?? "",
            method: purchase.paymentMethod,
          })),
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const byMonth = new Map<string, typeof upcoming>();
    for (const item of upcoming) {
      const key = monthKey(item.date);
      const list = byMonth.get(key) ?? [];
      list.push(item);
      byMonth.set(key, list);
    }

    const cashflow = new Map<string, { received: number; pending: number }>();
    const methods = new Map<string, { card: number; cash: number }>();
    const cashByDay = new Map<string, { received: number; pending: number }>();
    const methodsByDay = new Map<string, { card: number; cash: number }>();
    const bump = (
      map: Map<string, { received: number; pending: number }>,
      key: string,
      field: "received" | "pending",
      amount: number,
    ) => {
      const row = map.get(key) ?? { received: 0, pending: 0 };
      row[field] += amount;
      map.set(key, row);
    };
    for (const purchase of livePurchases) {
      for (const payment of activePayments(purchase)) {
        const day = payment.date.slice(0, 10);
        const key = weekStart(payment.date);
        bump(cashflow, key, "received", payment.amount);
        bump(cashByDay, day, "received", payment.amount);
        const methodRow = methods.get(key) ?? { card: 0, cash: 0 };
        methodRow[purchase.paymentMethod] += payment.amount;
        methods.set(key, methodRow);
        const methodDay = methodsByDay.get(day) ?? { card: 0, cash: 0 };
        methodDay[purchase.paymentMethod] += payment.amount;
        methodsByDay.set(day, methodDay);
      }
      for (const item of purchase.installments.filter((entry) => !entry.paid)) {
        const day = item.date.slice(0, 10);
        bump(cashflow, weekStart(item.date), "pending", item.amount);
        bump(cashByDay, day, "pending", item.amount);
      }
    }

    const currentWeek = weekStart(new Date().toISOString());
    const dataWeeks = [...cashflow.keys(), ...methods.keys()].sort();
    const fromWeek = dataWeeks[0] ?? addDays(currentWeek, -7 * 7);
    const cashWeeks = enumerateWeeks(fromWeek, addDays(currentWeek, 7 * 4));
    const methodWeeks = enumerateWeeks(fromWeek, currentWeek);
    const cashPoints: BarPoint[] = cashWeeks.map((key) => ({
      id: key,
      label: weekLabel(key),
      values: {
        received: cashflow.get(key)?.received ?? 0,
        pending: cashflow.get(key)?.pending ?? 0,
      },
    }));
    const methodPoints: BarPoint[] = methodWeeks.map((key) => ({
      id: key,
      label: weekLabel(key),
      values: {
        card: methods.get(key)?.card ?? 0,
        cash: methods.get(key)?.cash ?? 0,
      },
    }));
    const daysOf = (week: string) =>
      Array.from({ length: 7 }, (_, index) => addDays(week, index));

    return {
      counts,
      cobrado,
      pendiente,
      byPromo,
      byMonth,
      cashPoints,
      methodPoints,
      cashByDay,
      methodsByDay,
      daysOf,
      goalMoney,
      goalSeats,
      committedSeats,
      seats: seats.length,
    };
  }, [state.purchases, state.prices, state.promotions, state.tabulador, statusOf]);

  const cashSeries: BarSeries[] = [
    { key: "received", label: "Recibido", color: "#16A34A" },
    { key: "pending", label: "Pendiente", color: "#D97706" },
  ];
  const methodSeries: BarSeries[] = [
    { key: "card", label: "Tarjeta", color: "#1C2541" },
    { key: "cash", label: "Efectivo", color: "#9A6B43" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-bronze-dark">Dashboard e indicadores</p>
        <p className="text-sm text-ink-muted">Campus {campus}</p>
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        <article className="card p-5">
          <p className="text-sm text-ink-muted">Por vender</p>
          <p className="font-display text-3xl">{metrics.goalSeats} asientos</p>
          <p className="text-lg font-semibold">{money(metrics.goalMoney)}</p>
        </article>
        <article className="card p-5">
          <p className="text-sm text-ink-muted">A la fecha</p>
          <p className="font-display text-3xl">{metrics.committedSeats} asientos</p>
          <p className="text-sm text-available">Recibido {money(metrics.cobrado)}</p>
          <p className="text-sm text-held">Pendiente {money(metrics.pendiente)}</p>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <article className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Recibido vs pendiente / semana</p>
            <button type="button" className="text-xs font-semibold text-bronze-dark" onClick={() => setOpen("cashflow")}>
              Ampliar
            </button>
          </div>
          <div className="mt-2 h-40 overflow-x-auto">
            <MiniBarChart stacked series={cashSeries} points={metrics.cashPoints} height={150} />
          </div>
        </article>
        <article className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Formas de pago / semana</p>
            <button type="button" className="text-xs font-semibold text-bronze-dark" onClick={() => setOpen("methods")}>
              Ampliar
            </button>
          </div>
          <div className="mt-2 h-40 overflow-x-auto">
            <MiniBarChart stacked series={methodSeries} points={metrics.methodPoints} height={150} />
          </div>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vendidos" value={metrics.counts.sold} color="text-sold" />
        <Stat label="Apartados" value={metrics.counts.held} color="text-held" />
        <Stat label="Disponibles" value={metrics.counts.available} color="text-available" />
        <Stat label="No asignados" value={metrics.counts.unassigned} color="text-ink-muted" />
      </section>

      <section className="card p-5">
        <button type="button" className="flex w-full items-center justify-between" onClick={() => setCobrosOpen((v) => !v)}>
          <h3 className="font-display text-2xl">Próximos cobros</h3>
          <span className="text-sm text-ink-muted">{cobrosOpen ? "Ocultar" : "Ver"}</span>
        </button>
        {cobrosOpen ? (
          <div className="mt-3 space-y-3">
            {[...metrics.byMonth.entries()].map(([month, items]) => (
              <details key={month} className="rounded-2xl bg-surface p-3">
                <summary className="cursor-pointer font-semibold capitalize">
                  {monthLabel(month)} · {money(items.reduce((sum, item) => sum + item.amount, 0))}
                </summary>
                <table className="mt-2 w-full text-left text-sm">
                  <tbody>
                    {items.map((item) => (
                      <tr key={`${item.purchaseId}-${item.index}`} className="border-t border-slate-200">
                        <td className="py-1">{formatDate(item.date)}</td>
                        <td className="font-medium">{money(item.amount)}</td>
                        <td>
                          <RoleGate allow="tickets:read" fallback="••••">
                            {item.holder || item.phone}
                          </RoleGate>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
            {!metrics.byMonth.size && <p className="text-sm text-ink-muted">Sin cobros programados.</p>}
          </div>
        ) : null}
      </section>

      <section className="card p-5">
        <button type="button" className="flex w-full items-center justify-between" onClick={() => setPromoOpen((v) => !v)}>
          <h3 className="font-display text-2xl">Rendimiento por promoción</h3>
          <span className="text-sm text-ink-muted">{promoOpen ? "Ocultar" : "Ver"}</span>
        </button>
        {promoOpen ? (
          <table className="mt-3 w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="text-ink-muted">
                <th className="pb-2">Promoción</th>
                <th className="pb-2">Boletos</th>
                <th className="pb-2">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {[...metrics.byPromo.entries()].map(([name, row]) => (
                <tr key={name} className="border-t border-slate-200">
                  <td className="py-2 font-medium">{name}</td>
                  <td>{row.tickets}</td>
                  <td>{money(row.amount)}</td>
                </tr>
              ))}
              {!metrics.byPromo.size && (
                <tr>
                  <td colSpan={3} className="py-3 text-ink-muted">
                    Aún no hay ventas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : null}
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/70 p-3 sm:items-center" onClick={() => setOpen(null)}>
          <div className="card max-h-[90dvh] w-full max-w-3xl overflow-y-auto p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-2xl">
                {open === "cashflow" ? "Recibido vs pendiente" : "Formas de pago"}
              </h3>
              <button type="button" className="btn-ghost" onClick={() => setOpen(null)}>
                Cerrar
              </button>
            </div>
            <div className="h-64">
              <MiniBarChart
                stacked
                series={open === "cashflow" ? cashSeries : methodSeries}
                points={open === "cashflow" ? metrics.cashPoints : metrics.methodPoints}
                height={240}
                selectedId={expandedWeek}
                onSelect={(id) => setExpandedWeek((current) => (current === id ? null : id))}
              />
            </div>
            {expandedWeek ? (
              <div className="mt-4 h-48">
                <p className="mb-2 text-sm font-semibold">{weekLabel(expandedWeek)} por día</p>
                <MiniBarChart
                  stacked
                  series={open === "cashflow" ? cashSeries : methodSeries}
                  points={metrics.daysOf(expandedWeek).map((day) => {
                    const values: Record<string, number> =
                      open === "cashflow"
                        ? {
                            received: metrics.cashByDay.get(day)?.received ?? 0,
                            pending: metrics.cashByDay.get(day)?.pending ?? 0,
                          }
                        : {
                            card: metrics.methodsByDay.get(day)?.card ?? 0,
                            cash: metrics.methodsByDay.get(day)?.cash ?? 0,
                          };
                    return { id: day, label: dayLabel(day), values };
                  })}
                  height={180}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">Toca una semana para verla por día.</p>
            )}
            <ul className="mt-3 flex flex-wrap gap-3 text-sm">
              {(open === "cashflow" ? cashSeries : methodSeries).map((item) => (
                <li key={item.key} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ background: item.color }} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <article className="card p-5">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={`font-display text-4xl ${color}`}>{value}</p>
    </article>
  );
}
