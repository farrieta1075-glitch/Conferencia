"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AREA_LABELS, NO_EMAIL, NO_PHONE } from "@/lib/constants";
import { formatDate, formatDateTime, money, parseSeatId } from "@/lib/format";
import { whatsAppPreviewUrl } from "@/lib/notifications";
import {
  NOTIFY_KINDS,
  canNotifyPhone,
  fillNotifyTemplate,
  notifyVarsFor,
} from "@/lib/notifyTemplates";
import { activePayments, remainingBalance } from "@/lib/purchases";
import type { NotifyKind, Purchase, ReminderJob, SeatRef } from "@/lib/types";

function kindLabel(kind?: NotifyKind) {
  return NOTIFY_KINDS.find((item) => item.id === kind)?.label ?? "Mensaje";
}

export function NotifyPurchaseModal({
  purchase,
  installmentDate,
  eventDatetime,
  seatIndex,
  onClose,
  onRecord,
}: {
  purchase: Purchase;
  installmentDate?: string;
  eventDatetime: string;
  seatIndex: Map<string, SeatRef>;
  onClose: () => void;
  onRecord: (reminder: ReminderJob) => Promise<void>;
}) {
  const vars = useMemo(
    () => notifyVarsFor(purchase, seatIndex, eventDatetime, installmentDate),
    [eventDatetime, installmentDate, purchase, seatIndex],
  );
  const [kind, setKind] = useState<NotifyKind | null>(null);
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState(
    purchase.customer.phone.trim().toLowerCase() === NO_PHONE ? "" : purchase.customer.phone,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const seats = purchase.tickets.map((ticket) => {
    const seat = seatIndex.get(ticket.seatId);
    if (seat) {
      return `${AREA_LABELS[seat.areaId]} ${seat.sectionId} · ${seat.rowId}${seat.number}`;
    }
    const parsed = parseSeatId(ticket.seatId);
    return `${parsed.sectionId} · ${parsed.rowId}${parsed.number}`;
  });
  const holder =
    purchase.tickets.find((ticket) => ticket.holderName.trim())?.holderName.trim() || "Sin nombre";
  const email =
    !purchase.customer.email || purchase.customer.email.trim().toLowerCase() === NO_EMAIL
      ? "Sin correo"
      : purchase.customer.email;
  const sent = (purchase.reminders ?? []).filter((item) => item.channel === "whatsapp");
  const remaining = remainingBalance(purchase);

  function selectKind(next: NotifyKind) {
    setKind(next);
    setMessage(fillNotifyTemplate(next, vars));
    setError("");
  }

  async function send() {
    if (!kind) {
      setError("Selecciona un tipo de mensaje.");
      return;
    }
    if (!message.trim()) {
      setError("El mensaje no puede ir vacío.");
      return;
    }
    if (!canNotifyPhone(phone)) {
      setError("Indica un teléfono válido para WhatsApp.");
      return;
    }
    setBusy(true);
    setError("");
    const sentAt = new Date().toISOString();
    const reminder: ReminderJob = {
      id: `wa-${Date.now()}`,
      channel: "whatsapp",
      kind,
      to: phone.trim(),
      scheduledFor: sentAt,
      sentAt,
      message: message.trim(),
      status: "sent",
    };
    try {
      await onRecord(reminder);
      window.open(whatsAppPreviewUrl(phone, message.trim()), "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la notificación");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-bronze-dark">WhatsApp</p>
            <h3 className="font-display text-2xl text-ink">Notificar compra</h3>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Nombre</dt>
              <dd className="font-semibold">{holder}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Correo</dt>
              <dd>{email}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-muted">Teléfono (se usa en WhatsApp)</dt>
              <dd>
                <input
                  className="mt-1 w-full min-h-11 rounded-xl border border-slate-200 px-3"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  placeholder="Ej. 4421234567"
                />
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-muted">Asientos</dt>
              <dd>{seats.join(" · ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Total / pagado / saldo</dt>
              <dd>
                {money(purchase.total)} · {money(purchase.paid)} · {money(remaining)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Notificaciones enviadas</dt>
              <dd className="font-semibold">{sent.length}</dd>
            </div>
          </dl>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-semibold">Mensaje a enviar</p>
              <textarea
                className="min-h-64 w-full rounded-xl border border-slate-200 p-3 text-sm leading-relaxed"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Selecciona un tipo de comunicación para ver el texto sugerido. Puedes editarlo antes de enviar."
              />
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold">Tipo de comunicación</p>
              <div className="flex flex-col gap-2">
                {NOTIFY_KINDS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`min-h-12 rounded-xl px-3 text-left text-sm font-semibold ${
                      kind === item.id ? "bg-bronze text-white" : "bg-slate-100 text-ink"
                    }`}
                    onClick={() => selectKind(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Abonos</p>
              <ul className="mt-1 text-sm">
                {activePayments(purchase).length ? (
                  activePayments(purchase).map((item) => (
                    <li key={item.id} className="border-t border-slate-100 py-1">
                      {formatDate(item.date)} · {money(item.amount)} ·{" "}
                      {item.method === "cash" ? "Efectivo" : "Tarjeta"}
                    </li>
                  ))
                ) : (
                  <li className="text-ink-muted">Sin abonos registrados.</li>
                )}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Parcialidades</p>
              <ul className="mt-1 text-sm">
                {purchase.installments.length ? (
                  purchase.installments.map((item) => (
                    <li key={`${item.index}-${item.date}`} className="border-t border-slate-100 py-1">
                      {formatDate(item.date)} · {money(item.amount)} · {item.paid ? "Pagada" : "Pendiente"}
                    </li>
                  ))
                ) : (
                  <li className="text-ink-muted">Sin calendario de parcialidades.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-semibold">Historial de notificaciones</p>
            {sent.length ? (
              <ul className="mt-1 text-sm">
                {sent.map((item) => (
                  <li key={item.id} className="border-t border-slate-100 py-1">
                    {formatDateTime(item.sentAt || item.scheduledFor)} · {kindLabel(item.kind)} · {item.to}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">Aún no se ha enviado ningún mensaje.</p>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-slate-200 px-4 py-3 sm:px-5">
          {error ? <p className="mb-2 text-sm text-sold">{error}</p> : null}
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? "Abriendo WhatsApp…" : kind ? `Enviar: ${kindLabel(kind)}` : "Enviar por WhatsApp"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
