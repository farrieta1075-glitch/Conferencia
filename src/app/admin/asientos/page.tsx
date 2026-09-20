"use client";

import { useEffect, useMemo, useState } from "react";
import { CurvedSeatMap } from "@/components/CurvedSeatMap";
import { ImportTabulador } from "@/components/ImportTabulador";
import { SeatLegend } from "@/components/SeatLegend";
import { RoleGate, useCan } from "@/components/auth/RoleGate";
import { useEventStore } from "@/context/EventStore";
import { seatId } from "@/lib/format";
import { findSection } from "@/lib/tabulador/generator";
import { sortedRows } from "@/lib/tabulador/seats";
import type { SeatStatus } from "@/lib/types";

export default function AsientosAdminPage() {
  const { state, saveSeatAssignments } = useEventStore();
  const canEdit = useCan("seats:edit");
  const [sectionId, setSectionId] = useState(state.tabulador.areas[0]?.sections[0]?.id ?? "105");
  const [draft, setDraft] = useState<Record<string, SeatStatus>>(state.seatStatus);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const located = findSection(state.tabulador, sectionId);

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
    return draft[id] ?? "unassigned";
  }

  function applyStatus(ids: string[], status: "available" | "unassigned") {
    if (!canEdit) return;
    setDraft((current) => {
      const next = { ...current };
      for (const id of ids) {
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
    if (!canEdit || status === "held" || status === "sold") return;
    applyStatus([id], status === "available" ? "unassigned" : "available");
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
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-bronze-dark">Módulo 2 · Admin</p>
        <h2 className="font-display text-3xl">Asignación de áreas y asientos</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Verde = a la venta. Gris = no asignado. Los cambios son un borrador hasta pulsar{" "}
          <strong>Guardar disponibilidad</strong>; solo entonces aparecen en el módulo de venta.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {state.tabulador.areas.map((area) => (
            <div key={area.id} className="min-w-40">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {area.name}
              </p>
              <div className="flex flex-wrap gap-1">
                {area.sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={`min-h-12 rounded-xl px-3 text-sm font-semibold ${
                      sectionId === section.id ? "bg-bronze text-white" : "bg-slate-100"
                    }`}
                    onClick={() => setSectionId(section.id)}
                  >
                    {section.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <RoleGate allow="seats:edit">
            <button
              type="button"
              className="btn-primary"
              onClick={() => applyStatus(sectionSeatIds, "available")}
            >
              Toda la sección a la venta
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => applyStatus(sectionSeatIds, "unassigned")}
            >
              Quitar sección de venta
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? "Guardando…" : "Guardar disponibilidad"}
            </button>
            <button type="button" className="btn-ghost" disabled={!dirty || saving} onClick={discard}>
              Descartar
            </button>
          </RoleGate>
          {located && canEdit
            ? sortedRows(located.section.rows).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="btn-ghost px-3"
                  onClick={() =>
                    applyStatus(
                      row.seats.map((number) => seatId(located.section.id, row.id, number)),
                      "available",
                    )
                  }
                >
                  Fila {row.id}
                </button>
              ))
            : null}
        </div>
        {dirty ? (
          <p className="mt-3 text-sm text-held">Hay cambios sin guardar. Aún no se ven en venta.</p>
        ) : null}
        {message ? <p className="mt-3 text-sm text-available">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-sold">{error}</p> : null}
      </div>
      <SeatLegend />
      {located && (
        <div className="card p-3">
          <CurvedSeatMap
            sectionId={sectionId}
            selectedIds={[]}
            onSeatClick={toggle}
            statusOf={statusOfDraft}
          />
        </div>
      )}
      <ImportTabulador />
    </div>
  );
}
