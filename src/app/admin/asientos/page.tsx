"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CurvedSeatMap, type CurvedSeatMapHandle } from "@/components/CurvedSeatMap";
import { ImportCampusSales } from "@/components/ImportCampusSales";
import { ImportTabulador } from "@/components/ImportTabulador";
import { RoleGate, useCan } from "@/components/auth/RoleGate";
import { useEventStore } from "@/context/EventStore";
import { seatId } from "@/lib/format";
import { findSection } from "@/lib/tabulador/generator";
import { sortedRows } from "@/lib/tabulador/seats";
import type { SeatStatus } from "@/lib/types";

export default function AsientosAdminPage() {
  const { state, saveSeatAssignments } = useEventStore();
  const foreign = useMemo(() => new Set(state.foreignSeats ?? []), [state.foreignSeats]);
  const canEdit = useCan("seats:edit");
  const [openAreaId, setOpenAreaId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, SeatStatus>>(state.seatStatus);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const mapRef = useRef<CurvedSeatMapHandle>(null);
  const located = sectionId ? findSection(state.tabulador, sectionId) : null;

  useEffect(() => {
    if (dirty) return;
    setDraft(state.seatStatus);
  }, [dirty, state.seatStatus]);

  const sectionSeatIds = useMemo(() => {
    if (!located) return [];
    return located.section.rows.flatMap((row) =>
      row.seats.map((number) => seatId(located.section.id, row.id, number)),
    );
  }, [located]);

  function statusOfDraft(id: string): SeatStatus {
    if (foreign.has(id)) return "foreign";
    return draft[id] ?? "unassigned";
  }

  function applyStatus(ids: string[], status: "available" | "unassigned") {
    if (!canEdit) return;
    setDraft((current) => {
      const next = { ...current };
      for (const id of ids) {
        if (foreign.has(id)) continue;
        const now = next[id] ?? "unassigned";
        if (now === "held" || now === "sold") continue;
        if (status === "unassigned") delete next[id];
        else next[id] = "available";
      }
      return next;
    });
    setDirty(true);
    setMessage("");
    setError("");
  }

  function toggle(id: string, status: SeatStatus) {
    if (!canEdit || status === "held" || status === "sold" || status === "foreign") return;
    applyStatus([id], status === "available" ? "unassigned" : "available");
  }

  function toggleArea(areaId: string) {
    setSectionId(null);
    setOpenAreaId((current) => (current === areaId ? null : areaId));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveSeatAssignments(draft);
      setDirty(false);
      setMessage("Disponibilidad guardada. El módulo de venta ya muestra solo estos asientos.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar en Google Sheets");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setDraft(state.seatStatus);
    setDirty(false);
    setMessage("Cambios descartados.");
    setError("");
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_14rem] phone-landscape:grid-cols-[minmax(0,1fr)_11.5rem]">
        <div className="card flex min-h-0 flex-col p-3">
          {located && sectionId ? (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-xl">
                  {located.area.name} {located.section.id}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold"
                    onClick={() => mapRef.current?.zoomIn()}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold"
                    onClick={() => mapRef.current?.zoomOut()}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold"
                    onClick={() => mapRef.current?.reset()}
                  >
                    Ver todo
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <CurvedSeatMap
                  ref={mapRef}
                  sectionId={sectionId}
                  selectedIds={[]}
                  onSeatClick={toggle}
                  statusOf={statusOfDraft}
                  hideControls
                />
              </div>
              <RoleGate allow="seats:edit">
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center rounded-lg bg-bronze px-2.5 text-xs font-semibold text-white"
                    onClick={() => applyStatus(sectionSeatIds, "available")}
                  >
                    Toda la sección a la venta
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-ink"
                    onClick={() => applyStatus(sectionSeatIds, "unassigned")}
                  >
                    Quitar sección de venta
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center rounded-lg bg-bronze px-2.5 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={!dirty || saving}
                    onClick={() => void save()}
                  >
                    {saving ? "Guardando…" : "Guardar disponibilidad"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-ink disabled:opacity-50"
                    disabled={!dirty || saving}
                    onClick={discard}
                  >
                    Descartar
                  </button>
                  {sortedRows(located.section.rows).map((row, rowIndex) => (
                    <button
                      key={`${row.id}-${rowIndex}`}
                      type="button"
                      className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-ink"
                      onClick={() =>
                        applyStatus(
                          row.seats.map((number) => seatId(located.section.id, row.id, number)),
                          "available",
                        )
                      }
                    >
                      Fila {row.id}
                    </button>
                  ))}
                </div>
              </RoleGate>
              {dirty ? (
                <p className="mt-2 text-sm text-held">Hay cambios sin guardar. Aún no se ven en venta.</p>
              ) : null}
              {message ? <p className="mt-2 text-sm text-available">{message}</p> : null}
              {error ? <p className="mt-2 text-sm text-sold">{error}</p> : null}
            </>
          ) : (
            <div className="flex min-h-[min(68vh,760px)] flex-1 items-center justify-center rounded-2xl bg-navy-deep phone-landscape:min-h-[calc(100dvh-5.5rem)]">
              <p className="px-6 text-center text-sm text-white/80">
                Elige un área a la derecha y luego una sección para ver su mapa.
              </p>
            </div>
          )}
        </div>
        <aside className="card h-fit max-h-[min(80vh,900px)] overflow-y-auto p-2">
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Secciones
          </p>
          <ul className="space-y-1">
            {state.tabulador.areas.map((area) => {
              const open = openAreaId === area.id;
              return (
                <li key={area.id}>
                  <button
                    type="button"
                    className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold ${
                      open ? "bg-bronze text-white" : "bg-slate-100 text-ink"
                    }`}
                    onClick={() => toggleArea(area.id)}
                  >
                    <span>{area.name}</span>
                    <span className="text-xs opacity-80">{open ? "−" : "+"}</span>
                  </button>
                  {open ? (
                    <div className="mt-1 grid grid-cols-2 gap-1 px-1 pb-1">
                      {area.sections.map((section) => (
                        <button
                          key={`${area.id}-${section.id}`}
                          type="button"
                          className={`min-h-10 rounded-lg px-2 text-sm font-semibold ${
                            sectionId === section.id ? "bg-navy text-white" : "bg-white text-ink ring-1 ring-slate-200"
                          }`}
                          onClick={() => setSectionId(section.id)}
                        >
                          {section.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
      <ImportCampusSales />
      <ImportTabulador startCollapsed />
    </div>
  );
}
