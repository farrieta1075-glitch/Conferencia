"use client";

import { useEffect, useMemo, useRef } from "react";
import { formatDate, money, parseSeatId } from "@/lib/format";
import { isNamelessBlock, purchaseSeatStatus, remainingBalance } from "@/lib/purchases";
import type { Purchase } from "@/lib/types";

export interface SeatPurchasePeekState {
  purchase: Purchase;
  x: number;
  y: number;
}

function seatLabel(seatId: string) {
  const { sectionId, rowId, number } = parseSeatId(seatId);
  return `${sectionId} · ${rowId}${number}`;
}

export function SeatPurchasePeek({
  peek,
  onClose,
  canRelease = false,
  onRelease,
}: {
  peek: SeatPurchasePeekState;
  onClose: () => void;
  canRelease?: boolean;
  onRelease?: () => Promise<void> | void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const status = purchaseSeatStatus(peek.purchase);
  const pending = remainingBalance(peek.purchase);
  const names = useMemo(() => {
    const unique = [...new Set(peek.purchase.tickets.map((ticket) => ticket.holderName.trim()).filter(Boolean))];
    return unique.length ? unique : [isNamelessBlock(peek.purchase) ? "Bloqueo sin nombre" : "Sin nombre"];
  }, [peek.purchase]);
  const upcoming = peek.purchase.installments.filter((item) => !item.paid);
  const style = useMemo(() => {
    const width = Math.min(276, window.innerWidth - 24);
    const pad = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const navReserve = vw < 1024 ? 76 : 16;
    let left = peek.x + 18;
    if (left + width > vw - pad) left = peek.x - width - 18;
    left = Math.max(pad, Math.min(left, vw - width - pad));
    let top = peek.y - 24;
    top = Math.max(pad, Math.min(top, vh - 240 - navReserve));
    return { left, top, width };
  }, [peek.x, peek.y]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (cardRef.current?.contains(target)) return;
      if (target.closest("[data-seat-id]")) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={status === "sold" ? "Compra vendida" : "Compra apartada"}
      className="fixed z-[100] max-h-[min(52dvh,22rem)] overflow-y-auto rounded-2xl bg-white p-3 text-ink shadow-2xl ring-1 ring-slate-200"
      style={style}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-bronze-dark">
            {isNamelessBlock(peek.purchase) ? "Bloqueado" : status === "sold" ? "Vendido" : "Apartado"}
          </p>
          <p className="font-display text-lg leading-tight">{names.join(", ")}</p>
        </div>
        <button type="button" className="btn-ghost min-h-9 px-2 text-sm" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{peek.purchase.customer.email}</p>
      {status === "held" ? (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-surface p-2 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">Pagado</p>
            <p className="font-semibold text-available">{money(peek.purchase.paid)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">Pendiente</p>
            <p className="font-semibold text-held">{money(pending)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-sold">Pagado {money(peek.purchase.total)}</p>
      )}
      <p className="mt-3 text-[10px] uppercase tracking-wider text-ink-muted">
        Asientos ({peek.purchase.tickets.length})
      </p>
      <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-sm">
        {peek.purchase.tickets.map((ticket) => (
          <li key={ticket.id} className="flex justify-between gap-2">
            <span>{seatLabel(ticket.seatId)}</span>
            <span className="text-ink-muted">{ticket.holderName}</span>
          </li>
        ))}
      </ul>
      {status === "held" ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-ink-muted">Próximas fechas de pago</p>
          {upcoming.length ? (
            <ul className="mt-1 space-y-1 text-sm">
              {upcoming.map((item) => (
                <li key={`${item.index}-${item.date}`} className="flex justify-between gap-2">
                  <span>{formatDate(item.date)}</span>
                  <span className="font-semibold">{money(item.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">No hay fechas pendientes.</p>
          )}
        </div>
      ) : null}
      {canRelease && onRelease ? (
        <button
          type="button"
          className="btn-secondary mt-3 w-full"
          onClick={() => void onRelease()}
        >
          Desbloquear lugares
        </button>
      ) : null}
    </div>
  );
}
