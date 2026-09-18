"use client";

import { useMemo, useState } from "react";
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
  const { state, assignSeats } = useEventStore();
  const canEdit = useCan("seats:edit");
  const [sectionId, setSectionId] = useState(state.tabulador.areas[0]?.sections[0]?.id ?? "105");
  const located = findSection(state.tabulador, sectionId);

  const sectionSeatIds = useMemo(() => {
    if (!located) return [];
    return located.section.rows.flatMap((row) =>
      row.seats.map((number) => seatId(located.section.id, row.id, number)),
    );
  }, [located]);

  function toggle(id: string, status: SeatStatus) {
    if (!canEdit || status === "held" || status === "sold") return;
    void assignSeats({
      seatIds: [id],
      status: status === "available" ? "unassigned" : "available",
    });
  }

  function setMany(ids: string[], status: "available" | "unassigned") {
    if (!canEdit) return;
    void assignSeats({ seatIds: ids, status });
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-bronze-dark">Módulo 2 · Admin</p>
        <h2 className="font-display text-3xl">Asignación de áreas y asientos</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Verde = a la venta. Gris = no asignado. Los asientos vendidos o apartados no se pueden
          devolver a inventario desde aquí.
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
              onClick={() => setMany(sectionSeatIds, "available")}
            >
              Toda la sección a la venta
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setMany(sectionSeatIds, "unassigned")}
            >
              Quitar sección de venta
            </button>
          </RoleGate>
          {located && canEdit
            ? sortedRows(located.section.rows).map((row) => (
            <button
              key={row.id}
              type="button"
              className="btn-ghost px-3"
              onClick={() =>
                setMany(
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
      </div>
      <SeatLegend />
      {located && (
        <div className="card p-3">
          <CurvedSeatMap
            sectionId={sectionId}
            selectedIds={[]}
            onSeatClick={toggle}
          />
        </div>
      )}
      <ImportTabulador />
    </div>
  );
}
