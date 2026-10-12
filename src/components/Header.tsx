"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useEventStore } from "@/context/EventStore";
import { useSalesFocus } from "@/context/SalesFocus";
import { roleLabel } from "@/lib/auth/roles";
import { formatLiveClock } from "@/lib/format";
import { campusLabel } from "@/lib/campus";
import { CAMPUS_OPTIONS, useCampus } from "@/context/CampusContext";
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

export function Header({ compact = false }: { compact?: boolean }) {
  const { state, availableCount } = useEventStore();
  const { data: session } = useSession();
  const { campus, canSwitch, setCampus } = useCampus();
  const focus = useSalesFocus();
  const now = useNow();
  const eventDate = new Date(state.event.datetime);
  const count = now ? countdownParts(eventDate, now) : null;
  const focusedAvailable = compact && focus?.sectionId ? focus.available : null;
  const shownAvailable = focusedAvailable ?? availableCount;
  const availabilityLabel = compact && focus?.sectionId ? `Sección ${focus.sectionId}` : "Venta";

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-white/10 bg-navy/95 text-white backdrop-blur">
      <div
        className={`mx-auto flex max-w-7xl px-3 sm:px-4 ${
          compact
            ? "flex-row items-center justify-between gap-2 py-1.5 sm:gap-3 sm:py-2 max-[1100px]:landscape:py-1"
            : "flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between max-[1100px]:landscape:flex-row max-[1100px]:landscape:items-center max-[1100px]:landscape:gap-2 max-[1100px]:landscape:py-1.5"
        }`}
      >
        <div className={`flex min-w-0 items-center gap-2 sm:gap-3 ${compact ? "min-h-9" : "min-h-12 max-[1100px]:landscape:min-h-10"}`}>
          {state.event.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.event.logoDataUrl}
              alt={`Logo de ${state.event.name}`}
              className={`rounded-2xl object-cover ring-1 ring-bronze/50 ${compact ? "h-9 w-9 sm:h-11 sm:w-11" : "h-12 w-12 max-[1100px]:landscape:h-10 max-[1100px]:landscape:w-10"}`}
            />
          ) : (
            <LogoMark className={compact ? "h-9 w-9 sm:h-11 sm:w-11" : "h-12 w-12 max-[1100px]:landscape:h-10 max-[1100px]:landscape:w-10"} />
          )}
          <div className="min-w-0">
            <p className={`uppercase tracking-[0.18em] text-bronze ${compact ? "hidden text-[10px] sm:block" : "text-[11px] max-[1100px]:landscape:hidden"}`}>
              Auditorio Nacional · CDMX
            </p>
            <h1 className={`font-display leading-tight ${compact ? "truncate text-base sm:text-xl" : "text-xl md:text-2xl"}`}>
              {state.event.name}
            </h1>
          </div>
        </div>

        {compact ? (
          <>
            <div className="flex min-h-9 shrink-0 items-center rounded-2xl bg-bronze px-2.5 py-1 text-white sm:min-h-10 sm:px-3 sm:py-1.5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/80">
                  {focus?.sectionId ? `Disp. · ${focus.sectionId}` : "Disponibles"}
                </p>
                <p className="font-display text-xl leading-none sm:text-2xl">{shownAvailable}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 max-[1100px]:landscape:hidden">
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
        )}
        {session?.user && (
          <div className={`flex shrink-0 items-center gap-2 rounded-2xl bg-navy-mid px-2 py-1.5 sm:gap-3 sm:px-3 sm:py-2 ${compact ? "" : "justify-between lg:flex-col lg:items-end"}`}>
            <div className={compact ? "hidden text-right sm:block" : "text-right"}>
              <p className="text-sm font-semibold">{session.user.email}</p>
              <p className="text-[10px] uppercase tracking-wider text-bronze">
                {session.user.role ? roleLabel(session.user.role) : ""} · {campusLabel(campus)}
              </p>
              {canSwitch ? (
                <select
                  className="mt-1 max-w-28 rounded-lg bg-navy px-1 py-0.5 text-[10px] text-white"
                  value={campus}
                  onChange={(event) => setCampus(event.target.value as typeof campus)}
                  aria-label="Campus"
                >
                  {CAMPUS_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              ) : null}
              {session.user.role === "PRACTICE" ? (
                <p className="mt-0.5 text-[10px] font-semibold text-amber-300">
                  Práctica · no se guarda en Google Sheets
                </p>
              ) : null}
            </div>
            {compact && canSwitch ? (
              <select
                className="min-h-9 max-w-20 rounded-lg bg-navy px-1 text-[10px] text-white sm:hidden"
                value={campus}
                onChange={(event) => setCampus(event.target.value as typeof campus)}
                aria-label="Campus"
              >
                {CAMPUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            ) : null}
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
