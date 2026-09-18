"use client";

import { useEffect, useMemo, useState } from "react";
import { useEventStore } from "@/context/EventStore";
import { formatDate, money } from "@/lib/format";
import { buildInstallmentPlans } from "@/lib/installments";
import { whatsAppPreviewUrl } from "@/lib/notifications";
import { priceForSeat } from "@/lib/pricing";
import type { InstallmentCount, PaymentMethod, PaymentMode, SeatRef } from "@/lib/types";

interface PurchaseModalProps {
  open: boolean;
  seats: SeatRef[];
  onClose: () => void;
  onCompleted: () => void;
}

export function PurchaseModal({ open, seats, onClose, onCompleted }: PurchaseModalProps) {
  const { state, buy } = useEventStore();
  const seatKey = seats.map((seat) => seat.id).join("|");
  const [sameName, setSameName] = useState(true);
  const [names, setNames] = useState<string[]>(() => seats.map(() => ""));

  useEffect(() => {
    if (open) setNames(Array.from({ length: seats.length }, () => ""));
  }, [open, seatKey, seats.length]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("total");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [deposit, setDeposit] = useState(0);
  const [plan, setPlan] = useState<InstallmentCount>(3);
  const [remindWhatsApp, setRemindWhatsApp] = useState(true);
  const [remindEmail, setRemindEmail] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const priced = useMemo(
    () =>
      seats.map((seat) => ({
        seat,
        ...priceForSeat(seat, state.prices, state.promotions),
      })),
    [seats, state.prices, state.promotions],
  );
  const total = priced.reduce((sum, item) => sum + item.price, 0);
  const plans = useMemo(
    () => buildInstallmentPlans(total, deposit, state.event.datetime),
    [deposit, state.event.datetime, total],
  );

  if (!open) return null;

  function updateName(index: number, value: string) {
    setNames((current) => {
      if (sameName) return current.map(() => value);
      return current.map((item, i) => (i === index ? value : item));
    });
  }

  async function submit() {
    setError("");
    const holderNames = sameName ? seats.map(() => names[0]?.trim() ?? "") : names.map((n) => n.trim());
    if (holderNames.some((name) => !name)) {
      setError("Captura el nombre del titular de cada boleto.");
      return;
    }
    if (!phone.trim() || !email.trim()) {
      setError("Teléfono y correo son obligatorios.");
      return;
    }
    if (paymentMode === "partial") {
      if (deposit <= 0 || deposit >= total) {
        setError("El anticipo debe ser mayor a 0 y menor al total.");
        return;
      }
      if (!plans.length) {
        setError("No hay plazo: el evento está a 3 semanas o menos.");
        return;
      }
    }
    setBusy(true);
    try {
      await buy({
        seatIds: seats.map((seat) => seat.id),
        holderNames,
        phone: phone.trim(),
        email: email.trim(),
        paymentMode,
        paymentMethod,
        deposit: paymentMode === "partial" ? deposit : total,
        selectedPlan: paymentMode === "partial" ? plan : undefined,
        remindWhatsApp: paymentMode === "partial" && remindWhatsApp,
        remindEmail: paymentMode === "partial" && remindEmail,
      });
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la compra");
    } finally {
      setBusy(false);
    }
  }

  const previewMessage = `Recordatorio de pago para ${state.event.name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/70 p-3 sm:items-center">
      <div className="card max-h-[92dvh] w-full max-w-3xl overflow-y-auto p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-bronze-dark">Registro de compra</p>
            <h2 className="font-display text-3xl text-ink">Boletos seleccionados</h2>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <ul className="mb-4 space-y-2">
          {priced.map((item) => (
            <li
              key={item.seat.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 text-sm"
            >
              <span>
                {item.seat.areaName} · Zona {item.seat.sectionName} · Fila {item.seat.rowId} · Asiento{" "}
                {item.seat.number}
              </span>
              <span className="font-semibold">
                {money(item.price)}
                {item.promotion ? (
                  <span className="ml-2 text-bronze-dark">({item.promotion.name})</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="mb-4 text-right text-lg font-semibold">Total {money(total)}</p>

        <label className="mb-4 flex min-h-12 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={sameName}
            onChange={(event) => setSameName(event.target.checked)}
            className="h-5 w-5"
          />
          Aplicar el mismo nombre a todos los boletos
        </label>

        <div className="grid gap-3">
          {(sameName ? [0] : seats.map((_, i) => i)).map((index) => (
            <label key={index} className="text-sm font-medium text-ink-muted">
              Titular {sameName ? "de todos los boletos" : `boleto ${index + 1}`}
              <input
                className="field mt-1"
                value={names[index] ?? ""}
                onChange={(event) => updateName(index, event.target.value)}
              />
            </label>
          ))}
          <label className="text-sm font-medium text-ink-muted">
            Teléfono
            <input className="field mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-ink-muted">
            Correo electrónico
            <input
              className="field mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Modalidad de pago</legend>
            <div className="flex gap-2">
              {(["total", "partial"] as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={paymentMode === mode ? "btn-primary flex-1" : "btn-ghost flex-1"}
                  onClick={() => setPaymentMode(mode)}
                >
                  {mode === "total" ? "Total" : "Parcial"}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Método de pago</legend>
            <div className="flex gap-2">
              {(["card", "cash"] as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  type="button"
                  className={paymentMethod === method ? "btn-secondary flex-1" : "btn-ghost flex-1"}
                  onClick={() => setPaymentMethod(method)}
                >
                  {method === "card" ? "Tarjeta" : "Efectivo"}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {paymentMode === "partial" && (
          <div className="mt-4 rounded-2xl bg-surface p-4">
            <label className="text-sm font-medium text-ink-muted">
              Anticipo abonado
              <input
                className="field mt-1"
                type="number"
                min={0}
                value={deposit || ""}
                onChange={(e) => setDeposit(Number(e.target.value))}
              />
            </label>
            <p className="mt-2 text-xs text-ink-muted">
              Las parcialidades se distribuyen desde hoy hasta 3 semanas antes del evento (
              {formatDate(state.event.datetime)}).
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {plans.map((item) => (
                <button
                  key={item.n}
                  type="button"
                  onClick={() => setPlan(item.n)}
                  className={`rounded-2xl border p-3 text-left ${
                    plan === item.n ? "border-bronze bg-white" : "border-slate-200 bg-white/60"
                  }`}
                >
                  <p className="font-semibold">{item.n} parcialidades</p>
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {item.payments.map((payment, index) => (
                        <tr key={`${item.n}-${payment.date}`}>
                          <td>{index === 0 ? "Anticipo" : `Pago ${index}`}</td>
                          <td>{formatDate(payment.date)}</td>
                          <td className="text-right font-medium">{money(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex min-h-12 items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={remindWhatsApp}
                  onChange={(e) => setRemindWhatsApp(e.target.checked)}
                />
                Programar recordatorios por WhatsApp (simulado)
              </label>
              <label className="flex min-h-12 items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={remindEmail}
                  onChange={(e) => setRemindEmail(e.target.checked)}
                />
                Programar recordatorios por correo (simulado)
              </label>
              {phone && (
                <a
                  className="text-bronze-dark underline"
                  href={whatsAppPreviewUrl(phone, previewMessage)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Vista previa de WhatsApp
                </a>
              )}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-sold">{error}</p>}

        <button type="button" className="btn-primary mt-5 w-full" disabled={busy} onClick={submit}>
          {busy ? "Registrando…" : "Confirmar compra"}
        </button>
      </div>
    </div>
  );
}
