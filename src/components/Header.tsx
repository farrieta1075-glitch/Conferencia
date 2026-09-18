"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useEventStore } from "@/context/EventStore";
import { useSalesFocus } from "@/context/SalesFocus";
import { roleLabel } from "@/lib/auth/roles";
import { formatLiveClock } from "@/lib/format";
import { LogoMark } from "./LogoMark";

function useNow(interval = 1000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), interval);
    return () => window.clearInterval(id);
  }, [interval]);
  return now;
}

function countdownParts(target: Date, now: Date) {
  const diff = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: diff <= 0,
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-10 text-center">
      <div className="font-display text-lg leading-none text-white md:text-xl">
        {String(value).padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-slate-300">{label}</div>
    </div>
  );
}

export function Header() {
  const { state, availableCount } = useEventStore();
  const { data: session } = useSession();
  const focus = useSalesFocus();
  const now = useNow();
  const eventDate = new Date(state.event.datetime);
  const count = now ? countdownParts(eventDate, now) : null;
  const focusedAvailable = focus?.sectionId ? focus.available : null;
  const shownAvailable = focusedAvailable ?? availableCount;
  const availabilityLabel = focus?.sectionId
    ? `Sección ${focus.sectionId}`
    : "Venta";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/95 text-white backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-h-12 items-center gap-3">
          {state.event.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.event.logoDataUrl}
              alt={`Logo de ${state.event.name}`}
              className="h-12 w-12 rounded-2xl object-cover ring-1 ring-bronze/50"
            />
          ) : (
            <LogoMark className="h-12 w-12" />
          )}
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-bronze">
              Auditorio Nacional · CDMX
            </p>
            <h1 className="font-display text-xl leading-tight md:text-2xl">
              {state.event.name}
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex min-h-12 items-center justify-between rounded-2xl bg-navy-mid px-3 py-2 sm:block">
            <p className="text-[10px] uppercase tracking-wider text-slate-300">Ahora</p>
            <p className="text-sm font-semibold tabular-nums">
              {now ? formatLiveClock(now) : "—"}
            </p>
          </div>

          <div className="flex min-h-12 items-center justify-between gap-2 rounded-2xl bg-navy-mid px-3 py-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-300">
                Cuenta regresiva
              </p>
              {!count ? (
                <p className="text-sm font-semibold tabular-nums text-slate-300">—</p>
              ) : count.expired ? (
                <p className="text-sm font-semibold text-bronze">Evento en curso</p>
              ) : (
                <div className="mt-1 flex gap-2">
                  <Unit value={count.days} label="días" />
                  <Unit value={count.hours} label="hrs" />
                  <Unit value={count.minutes} label="min" />
                  <Unit value={count.seconds} label="seg" />
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-12 items-center justify-between rounded-2xl bg-bronze px-4 py-2 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/80">
                {focus?.sectionId ? `Disponibles · ${focus.sectionId}` : "Lugares disponibles"}
              </p>
              <p className="font-display text-3xl leading-none">{shownAvailable}</p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide">{availabilityLabel}</span>
          </div>
        </div>
        {session?.user && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-navy-mid px-3 py-2 lg:flex-col lg:items-end">
            <div className="text-right">
              <p className="text-sm font-semibold">{session.user.email}</p>
              <p className="text-[10px] uppercase tracking-wider text-bronze">
                {session.user.role ? roleLabel(session.user.role) : ""}
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost min-h-10 px-3 text-xs text-white"
              onClick={() => void signOut({ callbackUrl: "/login" })}
            >
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
