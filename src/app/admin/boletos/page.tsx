"use client";

import { useEffect, useMemo, useState } from "react";
import { PurchaseSeatTour } from "@/components/PurchaseSeatTour";
import { RoleGate, useCan, useCurrentRole } from "@/components/auth/RoleGate";
import { useEventStore } from "@/context/EventStore";
import { NO_EMAIL, NO_PHONE } from "@/lib/constants";
import { isMexicoToday } from "@/lib/auth/schedule";
import { formatDate, formatNotifyBadgeDate, money, parseSeatId } from "@/lib/format";
import { lastNotificationForInstallment } from "@/lib/notifyTemplates";
import { isNamelessBlock, remainingBalance, type PurchasePatch } from "@/lib/purchases";
import type { PaymentRecord, Purchase } from "@/lib/types";

function firstHolder(purchase: Purchase) {
  if (isNamelessBlock(purchase)) return "Bloqueo sin nombre";
  return purchase.tickets[0]?.holderName?.trim() || (purchase.customer.email === NO_EMAIL ? "" : purchase.customer.email);
}

function seatSummary(purchase: Purchase) {
  const zones = new Set<string>();
  const seats = purchase.tickets.map((ticket) => {
    const parsed = parseSeatId(ticket.seatId);
    zones.add(parsed.sectionId);
    return `${parsed.rowId}${parsed.number}`;
  });
  return { zones: [...zones].join(", "), seats: seats.join(", ") };
}

function methodLabel(method: string) {
  if (method === "cash") return "Efectivo";
  if (method === "other") return "Otro";
  return "Tarjeta";
}

export default function BoletosAdminPage() {
  const { state, seatIndex, statusOf, updatePurchase, applyPayment, voidPayment, releaseBlock } = useEventStore();
  const role = useCurrentRole();
  const isViewer = role === "VIEWER";
  const canVoidBlock = role === "ADMIN";
  function canCancelPayment(payment: PaymentRecord) {
    if (payment.cancelled) return false;
    if (role === "ADMIN") return true;
    return role === "VIEWER" && isMexicoToday(payment.date);
  }
  const canPay = useCan("payments:complete");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "held" | "sold">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PurchasePatch>({});
  const [amount, setAmount] = useState(0);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmPay, setConfirmPay] = useState<null | { settleAll: boolean }>(null);
  const [withPhone, setWithPhone] = useState(true);
  const [withEmail, setWithEmail] = useState(true);
  const [nameMode, setNameMode] = useState<"all" | "each">("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = state.purchases.find((item) => item.id === selectedId && !item.cancelled) ?? null;

  useEffect(() => {
    const current = state.purchases.find((item) => item.id === selectedId && !item.cancelled) ?? null;
    if (!current) {
      setDraft({});
      setAmount(0);
      setCancelId(null);
      setCancelReason("");
      setConfirmPay(null);
      if (!selectedId) {
        setError("");
        setMessage("");
      }
      return;
    }
    const hasEmail = Boolean(current.customer.email) && current.customer.email.trim().toLowerCase() !== NO_EMAIL;
    const hasPhone = Boolean(current.customer.phone) && current.customer.phone.trim().toLowerCase() !== NO_PHONE;
    setWithEmail(hasEmail);
    setWithPhone(hasPhone);
    const names = current.tickets.map((ticket) => ticket.holderName.trim());
    const sameName = names.length <= 1 || names.every((name) => name === names[0]);
    setNameMode(sameName ? "all" : "each");
    setDraft({
      phone: hasPhone ? current.customer.phone : "",
      email: hasEmail ? current.customer.email : "",
      tickets: current.tickets.map((ticket) => ({
        id: ticket.id,
        holderName: ticket.holderName,
      })),
    });
    setAmount(0);
    setCancelId(null);
    setCancelReason("");
    setConfirmPay(null);
    setError("");
    setMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.purchases.filter((purchase) => {
      if (purchase.cancelled) return false;
      const remaining = remainingBalance(purchase);
      const kind = remaining <= 0 ? "sold" : "held";
      if (filter !== "all" && filter !== kind) return false;
      if (!needle) return true;
      const summary = seatSummary(purchase);
      const haystack = [
        purchase.customer.email,
        purchase.customer.phone,
        firstHolder(purchase),
        summary.zones,
        summary.seats,
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
    setMessage("Guardando…");
    try {
      await updatePurchase(selected.id, {
        ...draft,
        phone: withPhone ? (draft.phone ?? "").trim() : NO_PHONE,
        email: withEmail ? (draft.email ?? "").trim() : NO_EMAIL,
      });
      setMessage("Datos guardados.");
    } catch (err) {
      setMessage("");
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
      setConfirmPay(null);
      setMessage(settleAll ? "Saldo liquidado. El boleto queda vendido." : "Abono registrado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el pago");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 phone-landscape:space-y-2">
      <div>
        <h2 className="font-display text-3xl phone-landscape:text-xl">Boletos</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="field"
            placeholder="Buscar por titular, asiento, zona, correo o teléfono"
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
      </div>

      <section className="card overflow-x-auto p-5">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-ink-muted">
              <th className="pb-2">Contacto</th>
              <th className="pb-2">Zona</th>
              <th className="pb-2">Asientos</th>
              <th className="pb-2">Pagado</th>
              {isViewer ? null : <th className="pb-2">Saldo</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((purchase) => {
              const remaining = remainingBalance(purchase);
              const summary = seatSummary(purchase);
              return (
                <tr
                  key={purchase.id}
                  className="cursor-pointer border-t border-slate-200 hover:bg-bronze/10"
                  onClick={() => setSelectedId(purchase.id)}
                >
                  <td className="py-2">
                    <div className="font-medium">{firstHolder(purchase)}</div>
                    <div className="text-xs text-ink-muted">{purchase.customer.phone}</div>
                  </td>
                  <td>{summary.zones}</td>
                  <td className="max-w-48 truncate">{summary.seats}</td>
                  <td>
                    {isViewer ? (remaining <= 0 ? "Completo" : "Parcial") : money(purchase.paid)}
                  </td>
                  {isViewer ? null : (
                    <td className={remaining > 0 ? "font-semibold text-held" : "text-available"}>
                      {remaining > 0 ? money(remaining) : "Liquidado"}
                    </td>
                  )}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={isViewer ? 4 : 5} className="py-4 text-ink-muted">
                  No hay boletos con ese criterio.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy/70 p-3 sm:items-center"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="card flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden p-0"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <h3 className="font-display text-2xl">Detalle de compra</h3>
                <p className="mt-1 font-semibold">{firstHolder(selected)}</p>
                <p className="text-sm text-ink-muted">
                  {seatSummary(selected).zones} · {seatSummary(selected).seats}
                </p>
              </div>
              <button type="button" className="btn-ghost shrink-0" onClick={() => setSelectedId(null)}>
                Cerrar
              </button>
            </div>

            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
            <RoleGate allow="tickets:edit">
              <details className="rounded-2xl border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Editar datos</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={withPhone}
                      onChange={(event) => {
                        setWithPhone(event.target.checked);
                        if (!event.target.checked) {
                          setDraft((current) => ({ ...current, phone: NO_PHONE }));
                        } else if ((draft.phone ?? "").toLowerCase() === NO_PHONE) {
                          setDraft((current) => ({ ...current, phone: "" }));
                        }
                      }}
                    />
                    El cliente proporciona teléfono
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={withEmail}
                      onChange={(event) => {
                        setWithEmail(event.target.checked);
                        if (!event.target.checked) {
                          setDraft((current) => ({ ...current, email: NO_EMAIL }));
                        } else if ((draft.email ?? "").toLowerCase() === NO_EMAIL) {
                          setDraft((current) => ({ ...current, email: "" }));
                        }
                      }}
                    />
                    El cliente proporciona correo
                  </label>
                  <label className="text-sm font-medium text-ink-muted">
                    Teléfono
                    <input
                      className="field mt-1"
                      disabled={!withPhone}
                      placeholder={withPhone ? "" : NO_PHONE}
                      value={withPhone ? (draft.phone === NO_PHONE ? "" : (draft.phone ?? "")) : ""}
                      onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm font-medium text-ink-muted">
                    Correo
                    <input
                      className="field mt-1"
                      type="email"
                      disabled={!withEmail}
                      placeholder={withEmail ? "" : NO_EMAIL}
                      value={withEmail ? (draft.email === NO_EMAIL ? "" : (draft.email ?? "")) : ""}
                      onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={nameMode === "all" ? "btn-primary px-3" : "btn-ghost px-3"}
                    onClick={() => {
                      const shared =
                        draft.tickets?.[0]?.holderName ?? selected.tickets[0]?.holderName ?? "";
                      setNameMode("all");
                      setDraft((current) => ({
                        ...current,
                        tickets: selected.tickets.map((item) => ({ id: item.id, holderName: shared })),
                      }));
                    }}
                  >
                    Todos los asientos
                  </button>
                  <button
                    type="button"
                    className={nameMode === "each" ? "btn-primary px-3" : "btn-ghost px-3"}
                    onClick={() => setNameMode("each")}
                  >
                    Uno por uno
                  </button>
                </div>
                {nameMode === "all" ? (
                  <label className="mt-3 block text-sm font-medium text-ink-muted">
                    Nombre
                    <input
                      className="field mt-1"
                      value={draft.tickets?.[0]?.holderName ?? selected.tickets[0]?.holderName ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((current) => ({
                          ...current,
                          tickets: selected.tickets.map((item) => ({ id: item.id, holderName: value })),
                        }));
                      }}
                    />
                  </label>
                ) : (
                  <ul className="mt-3 space-y-2">
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
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-ghost w-fit" disabled={busy} onClick={() => void saveSelected()}>
                    {busy && message === "Guardando…" ? "Guardando…" : "Guardar datos"}
                  </button>
                  {canVoidBlock && isNamelessBlock(selected) ? (
                    <button
                      type="button"
                      className="btn-secondary w-fit"
                      disabled={busy}
                      onClick={() => {
                        void (async () => {
                          setBusy(true);
                          setError("");
                          setMessage("");
                          try {
                            await releaseBlock(selected.id);
                            setSelectedId(null);
                            setMessage("Lugares desbloqueados.");
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "No se pudo desbloquear");
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      Desbloquear lugares
                    </button>
                  ) : null}
                </div>
              </details>
            </RoleGate>

            <PurchaseSeatTour
              seatIds={selected.tickets.map((ticket) => ticket.seatId)}
              statusOf={statusOf}
              tabulador={state.tabulador}
            />

            {canPay && remainingBalance(selected) > 0 ? (
              <div className="rounded-2xl bg-bronze/10 p-4">
                <h4 className="font-semibold">Abono</h4>
                <p className="mt-1 text-sm text-ink-muted">
                  Saldo pendiente {money(remainingBalance(selected))} de {money(selected.total)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="field max-w-40"
                    type="number"
                    min={0}
                    value={amount || ""}
                    onChange={(event) => setAmount(Number(event.target.value))}
                    placeholder="Abono"
                  />
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmPay({ settleAll: false })}>
                    Registrar abono
                  </button>
                  <button type="button" className="btn-primary" disabled={busy} onClick={() => setConfirmPay({ settleAll: true })}>
                    Liquidar saldo
                  </button>
                </div>
                {confirmPay ? (
                  <div className="mt-3 rounded-xl bg-white p-3">
                    <p className="text-sm font-medium">
                      {confirmPay.settleAll
                        ? `¿Liquidar el saldo de ${money(remainingBalance(selected))}?`
                        : `¿Registrar un abono de ${money(amount)}?`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy || (!confirmPay.settleAll && amount <= 0)}
                        onClick={() => void pay(confirmPay.settleAll)}
                      >
                        Confirmar
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setConfirmPay(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-2xl bg-surface p-4">
              <h4 className="font-semibold">
                Pagos realizados <span>{isViewer ? (remainingBalance(selected) <= 0 ? "Completo" : "Parcial") : money(selected.paid)}</span>
              </h4>
              {(selected.payments ?? []).length > 0 ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-ink-muted">
                      <th className="pb-1 text-left">Fecha</th>
                      <th className="pb-1 text-left">Monto</th>
                      <th className="pb-1 text-left">Método</th>
                      <th className="pb-1 text-left">Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.payments?.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200">
                        <td className="py-1">{formatDate(item.date)}</td>
                        <td>{money(item.amount)}</td>
                        <td>{methodLabel(item.method)}</td>
                        <td>
                          {item.cancelled ? (
                            <span className="text-xs text-sold">
                              Cancelado{item.cancelReason ? `: ${item.cancelReason}` : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              Vigente
                              {canCancelPayment(item) ? (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-sold"
                                  disabled={busy}
                                  onClick={() => setCancelId(item.id)}
                                >
                                  Cancelar pago
                                </button>
                              ) : null}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">Sin pagos registrados.</p>
              )}
              {cancelId && selected.payments?.some((item) => item.id === cancelId && canCancelPayment(item)) ? (
                <div className="mt-3 space-y-2 rounded-xl bg-white p-3">
                  <p className="text-sm font-medium">Confirma la cancelación del pago</p>
                  <p className="text-sm text-ink-muted">
                    {(selected.payments ?? [])
                      .filter((item) => item.id === cancelId)
                      .map((item) => `${formatDate(item.date)} · ${money(item.amount)}`)
                      .join("")}
                  </p>
                  <label className="text-sm font-medium text-ink-muted">
                    Razón de la cancelación
                    <textarea
                      className="field mt-1 min-h-20"
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => {
                        void (async () => {
                          if (!selected || !cancelId) return;
                          setBusy(true);
                          setError("");
                          setMessage("");
                          try {
                            await voidPayment(selected.id, cancelId, cancelReason);
                            setCancelId(null);
                            setCancelReason("");
                            setMessage("Pago cancelado.");
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "No se pudo cancelar el pago");
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      Confirmar cancelación
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setCancelId(null)}>
                      Cerrar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {selected.installments.length > 0 ? (
              <div className="rounded-2xl bg-surface p-4">
                <h4 className="font-semibold">Plan de parcialidades</h4>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-ink-muted">
                      <th className="pb-1 text-left">Pago</th>
                      <th className="pb-1 text-left">Fecha</th>
                      <th className="pb-1 text-left">Monto</th>
                      <th className="pb-1 text-left">Estatus</th>
                      <th className="pb-1 text-left">Notificado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.installments.map((item, installmentIndex) => {
                      const reminder = lastNotificationForInstallment(selected, item.date);
                      const when = reminder ? reminder.sentAt || reminder.scheduledFor : "";
                      return (
                      <tr key={`${item.index}-${item.date}-${installmentIndex}`} className="border-t border-slate-200">
                        <td className="py-1">Pago {item.index}</td>
                        <td>{formatDate(item.date)}</td>
                        <td>{money(item.amount)}</td>
                        <td>{item.paid ? "Pagado" : "Pendiente"}</td>
                        <td>
                          {reminder ? (
                            <span className="text-xs font-semibold text-available">
                              Notificado ({formatNotifyBadgeDate(when)})
                            </span>
                          ) : null}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {message ? <p className="text-sm text-available">{message}</p> : null}
            {error ? <p className="text-sm text-sold">{error}</p> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
