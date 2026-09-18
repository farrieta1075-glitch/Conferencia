"use client";

import { useMemo } from "react";
import { useEventStore } from "@/context/EventStore";
import { RoleGate } from "@/components/auth/RoleGate";
import { formatDate, money } from "@/lib/format";
import { flattenSeats } from "@/lib/tabulador/generator";

export default function DashboardPage() {
  const { state, statusOf } = useEventStore();

  const metrics = useMemo(() => {
    const seats = flattenSeats(state.tabulador);
    const counts = { unassigned: 0, available: 0, held: 0, sold: 0 };
    for (const seat of seats) counts[statusOf(seat.id)] += 1;

    const cobrado = state.purchases.reduce((sum, purchase) => sum + purchase.paid, 0);
    const pendiente = state.purchases.reduce(
      (sum, purchase) => sum + Math.max(0, purchase.total - purchase.paid),
      0,
    );

    const byPromo = new Map<string, { tickets: number; amount: number }>();
    for (const purchase of state.purchases) {
      for (const ticket of purchase.tickets) {
        const key = ticket.promotionName ?? "Sin promoción";
        const current = byPromo.get(key) ?? { tickets: 0, amount: 0 };
        current.tickets += 1;
        current.amount += ticket.price;
        byPromo.set(key, current);
      }
    }

    const upcoming = state.purchases
      .flatMap((purchase) =>
        purchase.installments
          .filter((item) => !item.paid)
          .map((item) => ({
            ...item,
            purchaseId: purchase.id,
            email: purchase.customer.email,
            phone: purchase.customer.phone,
            method: purchase.paymentMethod,
          })),
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const calendar = new Map<string, { amount: number; count: number }>();
    for (const item of upcoming) {
      const key = item.date.slice(0, 10);
      const current = calendar.get(key) ?? { amount: 0, count: 0 };
      current.amount += item.amount;
      current.count += 1;
      calendar.set(key, current);
    }

    return { counts, cobrado, pendiente, byPromo, upcoming, calendar, seats: seats.length };
  }, [state.purchases, state.tabulador, statusOf]);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="text-xs uppercase tracking-wider text-bronze-dark">Módulo 5</p>
        <h2 className="font-display text-3xl">Dashboard de indicadores</h2>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <article className="card p-5">
          <p className="text-sm text-ink-muted">Cobrado</p>
          <p className="font-display text-4xl text-available">{money(metrics.cobrado)}</p>
        </article>
        <article className="card p-5">
          <p className="text-sm text-ink-muted">Pendiente por cobrar</p>
          <p className="font-display text-4xl text-held">{money(metrics.pendiente)}</p>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vendidos" value={metrics.counts.sold} color="text-sold" />
        <Stat label="Apartados" value={metrics.counts.held} color="text-held" />
        <Stat label="Disponibles" value={metrics.counts.available} color="text-available" />
        <Stat label="No asignados" value={metrics.counts.unassigned} color="text-ink-muted" />
      </section>

      <section className="card overflow-x-auto p-5">
        <h3 className="font-display text-2xl">Rendimiento por promoción</h3>
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
      </section>

      <section className="card overflow-x-auto p-5">
        <h3 className="font-display text-2xl">Próximos cobros parciales</h3>
        <p className="text-sm text-ink-muted">
          Calendario de parcialidades pendientes hasta 3 semanas antes del evento.
        </p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {[...metrics.calendar.entries()].map(([day, row]) => (
            <div key={day} className="min-w-36 rounded-2xl bg-surface px-3 py-2">
              <p className="text-xs uppercase text-ink-muted">{formatDate(`${day}T12:00:00`)}</p>
              <p className="font-semibold">{money(row.amount)}</p>
              <p className="text-xs text-ink-muted">{row.count} cobro(s)</p>
            </div>
          ))}
          {!metrics.calendar.size && (
            <p className="text-sm text-ink-muted">Sin fechas de cobro programadas.</p>
          )}
        </div>
        <table className="mt-3 w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="text-ink-muted">
              <th className="pb-2">Fecha</th>
              <th className="pb-2">Monto</th>
              <th className="pb-2">Compra</th>
              <th className="pb-2">Contacto</th>
            </tr>
          </thead>
          <tbody>
            {metrics.upcoming.map((item) => (
              <tr key={`${item.purchaseId}-${item.index}`} className="border-t border-slate-200">
                <td className="py-2">{formatDate(item.date)}</td>
                <td className="font-medium">{money(item.amount)}</td>
                <td>{item.purchaseId}</td>
                <td>
                  <RoleGate allow="tickets:read" fallback="••••">
                    {item.phone} · {item.email}
                  </RoleGate>
                </td>
              </tr>
            ))}
            {!metrics.upcoming.length && (
              <tr>
                <td colSpan={4} className="py-3 text-ink-muted">
                  No hay cobros parciales pendientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
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
