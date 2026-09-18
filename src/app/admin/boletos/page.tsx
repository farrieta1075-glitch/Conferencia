"use client";

import { useEffect, useMemo, useState } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import { useEventStore } from "@/context/EventStore";
import { formatDate, money } from "@/lib/format";
import { remainingBalance, type PurchasePatch } from "@/lib/purchases";

export default function BoletosAdminPage() {
  const { state, seatIndex, updatePurchase, applyPayment } = useEventStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "held" | "sold">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PurchasePatch>({});
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = state.purchases.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setDraft({});
      return;
    }
    setDraft({
      phone: selected.customer.phone,
      email: selected.customer.email,
      tickets: selected.tickets.map((ticket) => ({
        id: ticket.id,
        holderName: ticket.holderName,
      })),
    });
    setAmount(0);
    setError("");
    setMessage("");
  }, [selectedId, selected]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.purchases.filter((purchase) => {
      const remaining = remainingBalance(purchase);
      const kind = remaining <= 0 ? "sold" : "held";
      if (filter !== "all" && filter !== kind) return false;
      if (!needle) return true;
      const haystack = [
        purchase.id,
        purchase.customer.email,
        purchase.customer.phone,
        ...purchase.tickets.map((ticket) => `${ticket.holderName} ${ticket.seatId}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [filter, query, state.purchases]);

  async function saveSelected() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updatePurchase(selected.id, draft);
      setMessage("Datos del boleto actualizados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function pay(settleAll: boolean) {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await applyPayment(selected.id, amount, settleAll);
      setAmount(0);
      setMessage(settleAll ? "Saldo liquidado. El boleto queda vendido." : "Abono registrado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el pago");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="text-xs uppercase tracking-wider text-bronze-dark">Módulo · Boletos</p>
        <h2 className="font-display text-3xl">Vendidos y apartados</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Edita titular y contacto, o completa pagos parciales y totales. Un apartado pasa a
          vendido cuando el saldo llega a cero.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="field"
            placeholder="Buscar por folio, titular, asiento, correo o teléfono"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex gap-2">
            {(["all", "held", "sold"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "btn-primary px-3" : "btn-ghost px-3"}
                onClick={() => setFilter(item)}
              >
                {item === "all" ? "Todos" : item === "held" ? "Apartados" : "Pagados"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card overflow-x-auto p-5">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-ink-muted">
              <th className="pb-2">Folio</th>
              <th className="pb-2">Contacto</th>
              <th className="pb-2">Boletos</th>
              <th className="pb-2">Pagado</th>
              <th className="pb-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((purchase) => {
              const remaining = remainingBalance(purchase);
              return (
                <tr
                  key={purchase.id}
                  className={`cursor-pointer border-t border-slate-200 ${
                    selectedId === purchase.id ? "bg-bronze/10" : ""
                  }`}
                  onClick={() => setSelectedId(purchase.id)}
                >
                  <td className="py-2 font-medium">{purchase.id}</td>
                  <td>
                    {purchase.customer.email}
                    <div className="text-xs text-ink-muted">{purchase.customer.phone}</div>
                  </td>
                  <td>{purchase.tickets.length}</td>
                  <td>{money(purchase.paid)}</td>
                  <td className={remaining > 0 ? "font-semibold text-held" : "text-available"}>
                    {remaining > 0 ? money(remaining) : "Liquidado"}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-4 text-ink-muted">
                  No hay boletos con ese criterio.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {selected && (
        <section className="card grid gap-4 p-5">
          <div>
            <h3 className="font-display text-2xl">Detalle {selected.id}</h3>
            <p className="text-sm text-ink-muted">
              {formatDate(selected.createdAt)} · {selected.paymentMethod === "card" ? "Tarjeta" : "Efectivo"}
            </p>
          </div>
          <RoleGate allow="tickets:edit">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-ink-muted">
                Teléfono
                <input
                  className="field mt-1"
                  value={draft.phone ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
              <label className="text-sm font-medium text-ink-muted">
                Correo
                <input
                  className="field mt-1"
                  value={draft.email ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
            </div>
            <ul className="space-y-2">
              {selected.tickets.map((ticket, index) => {
                const seat = seatIndex.get(ticket.seatId);
                return (
                  <li key={ticket.id} className="rounded-2xl bg-surface p-3">
                    <p className="text-xs text-ink-muted">
                      {seat
                        ? `${seat.areaName} · Zona ${seat.sectionName} · Fila ${seat.rowId} · Asiento ${seat.number}`
                        : ticket.seatId}{" "}
                      · {money(ticket.price)}
                    </p>
                    <input
                      className="field mt-2"
                      value={draft.tickets?.[index]?.holderName ?? ticket.holderName}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          tickets: selected.tickets.map((item, i) => ({
                            id: item.id,
                            holderName:
                              i === index
                                ? event.target.value
                                : (current.tickets?.[i]?.holderName ?? item.holderName),
                          })),
                        }))
                      }
                    />
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn-ghost w-fit" disabled={busy} onClick={() => void saveSelected()}>
              Guardar datos
            </button>
          </RoleGate>

          <div className="rounded-2xl bg-surface p-4">
            <h4 className="font-semibold">Pagos</h4>
            <p className="text-sm text-ink-muted">
              Saldo {money(remainingBalance(selected))} de {money(selected.total)}
            </p>
            {selected.installments.length > 0 && (
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {selected.installments.map((item) => (
                    <tr key={item.index} className="border-t border-slate-200">
                      <td className="py-1">Pago {item.index}</td>
                      <td>{formatDate(item.date)}</td>
                      <td>{money(item.amount)}</td>
                      <td>{item.paid ? "Pagado" : "Pendiente"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <RoleGate allow="payments:complete">
              {remainingBalance(selected) > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="field max-w-40"
                    type="number"
                    min={0}
                    value={amount || ""}
                    onChange={(event) => setAmount(Number(event.target.value))}
                    placeholder="Abono"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => void pay(false)}
                  >
                    Registrar abono
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => void pay(true)}
                  >
                    Liquidar saldo
                  </button>
                </div>
              )}
            </RoleGate>
          </div>
          {message && <p className="text-sm text-available">{message}</p>}
          {error && <p className="text-sm text-sold">{error}</p>}
        </section>
      )}
    </div>
  );
}
