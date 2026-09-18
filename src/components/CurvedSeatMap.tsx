"use client";

import { useMemo } from "react";
import { useEventStore } from "@/context/EventStore";
import { COLORS } from "@/lib/constants";
import { aisleStripPath, polar, polarAtFraction, buildSectionGeometry } from "@/lib/geometry";
import { findSection } from "@/lib/tabulador/generator";
import { buildSectionAlignLayout } from "@/lib/tabulador/align";
import { sortedRows } from "@/lib/tabulador/seats";
import type { SeatSlot, SeatStatus, SectionGeometry, SectionSpec } from "@/lib/types";
import { seatId } from "@/lib/format";

const STATUS_FILL: Record<SeatStatus, string> = {
  unassigned: COLORS.unassigned,
  available: COLORS.available,
  held: COLORS.held,
  sold: COLORS.sold,
};

interface CurvedSeatMapProps {
  sectionId: string;
  selectedIds?: string[];
  onSeatClick?: (id: string, status: SeatStatus) => void;
}

function detailGeometry(
  base: SectionGeometry,
  rows: SectionSpec["rows"],
  totalWeight: number,
): SectionGeometry {
  const rowCount = Math.max(rows.length, 1);
  const rowPitch = 26;
  const seatPitch = 18;
  const rInner = 220;
  const rOuter = rInner + rowCount * rowPitch;
  const midR = (rInner + rOuter) / 2;
  const neededTheta = Math.max((Math.max(totalWeight, 1) * seatPitch) / midR, 0.22);
  const mid = (base.thetaStart + base.thetaEnd) / 2;
  return {
    ...base,
    rInner,
    rOuter,
    thetaStart: mid - neededTheta / 2,
    thetaEnd: mid + neededTheta / 2,
  };
}

function slotLabel(slot: SeatSlot): string {
  if (slot.kind === "aisle") return `Pasillo ${slot.id}`;
  if (slot.kind === "clear") return "Hueco";
  if (slot.kind === "empty") return "Columna vacía";
  return `Asiento ${slot.number}`;
}

export function CurvedSeatMap({
  sectionId,
  selectedIds = [],
  onSeatClick,
}: CurvedSeatMapProps) {
  const { state, statusOf } = useEventStore();
  const located = findSection(state.tabulador, sectionId);
  const baseGeometry = useMemo(
    () => buildSectionGeometry(state.tabulador).find((item) => item.sectionId === sectionId),
    [sectionId, state.tabulador],
  );
  const rows = useMemo(
    () => (located ? sortedRows(located.section.rows) : []),
    [located],
  );
  const align = useMemo(() => buildSectionAlignLayout(rows), [rows]);

  if (!located || !baseGeometry) {
    return <p className="text-ink-muted">Sección no encontrada en el tabulador.</p>;
  }

  const geometry = detailGeometry(baseGeometry, rows, align.totalWeight);
  const selected = new Set(selectedIds);
  const mid = (geometry.thetaStart + geometry.thetaEnd) / 2;
  const focus = polar((geometry.rInner + geometry.rOuter) / 2, mid);
  const stage = polar(geometry.rInner - 70, mid);
  const points = align.rows.flatMap((placements, rowIndex) =>
    placements.map((item) => polarAtFraction(geometry, rowIndex, rows.length, item.t)),
  );
  const xs = [...points.map((point) => point.x), stage.x, focus.x];
  const ys = [...points.map((point) => point.y), stage.y, focus.y];
  const viewX = Math.min(...xs) - 48;
  const viewY = Math.min(...ys) - 64;
  const viewW = Math.max(Math.max(...xs) - viewX + 48, 200);
  const viewH = Math.max(Math.max(...ys) - viewY + 56, 200);

  return (
    <svg
      viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
      className="h-[min(70vh,720px)] w-full rounded-2xl bg-navy-deep"
      role="img"
      aria-label={`Asientos curvos de la sección ${sectionId}`}
    >
      <text
        x={focus.x}
        y={viewY + 32}
        textAnchor="middle"
        fill="#9A6B43"
        fontSize="22"
        fontWeight="700"
      >
        {located.area.name} · {located.section.name}
      </text>
      <text
        x={stage.x}
        y={stage.y}
        textAnchor="middle"
        fill="#F8FAFC"
        fontSize="13"
        fontWeight="700"
        letterSpacing="2"
      >
        ESCENARIO
      </text>
      {align.aisles.map((aisle) => (
        <path
          key={`aisle-strip-${aisle.id}`}
          d={aisleStripPath(geometry, aisle.t, aisle.width)}
          fill="#060B18"
          opacity="0.92"
        />
      ))}
      {align.aisles.map((aisle) => {
        const label = polarAtFraction(geometry, rows.length / 2, rows.length, aisle.t);
        return (
          <text
            key={`aisle-label-${aisle.id}`}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#9AA3B5"
            fontSize="8"
            fontWeight="700"
          >
            {aisle.id}
          </text>
        );
      })}
      {rows.map((row, rowIndex) => {
        const placements = align.rows[rowIndex] ?? [];
        const labelPoint = polarAtFraction(geometry, rowIndex, rows.length, 0);
        const labelOuter = polar(labelPoint.r, geometry.thetaStart - 0.045);
        return (
          <g key={row.id}>
            <text
              x={labelOuter.x}
              y={labelOuter.y}
              fill="#F8FAFC"
              fontSize="11"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {row.id}
            </text>
            {placements.map((item, slotIndex) => {
              const point = polarAtFraction(geometry, rowIndex, rows.length, item.t);
              const deg = (point.theta * 180) / Math.PI;
              const slot = item.slot;
              if (slot.kind !== "seat") {
                if (slot.kind === "aisle") return null;
                return (
                  <g
                    key={`${row.id}-${slot.kind}-${slotIndex}`}
                    transform={`translate(${point.x} ${point.y}) rotate(${deg})`}
                  >
                    <title>{`Fila ${row.id} · ${slotLabel(slot)}`}</title>
                    {slot.kind === "empty" ? (
                      <rect
                        x={-7}
                        y={-8}
                        width={14}
                        height={16}
                        rx={2}
                        fill="none"
                        stroke="#4B5C78"
                        strokeDasharray="2 2"
                        strokeWidth={1}
                      />
                    ) : null}
                  </g>
                );
              }
              const id = seatId(located.section.id, row.id, slot.number);
              const status = statusOf(id);
              const isSelected = selected.has(id);
              const accessible = row.accessibleSeats?.includes(slot.number);
              return (
                <g
                  key={id}
                  transform={`translate(${point.x} ${point.y}) rotate(${deg})`}
                  className="cursor-pointer"
                  onClick={() => onSeatClick?.(id, status)}
                >
                  <title>
                    {`Fila ${row.id} asiento ${slot.number} · ${status}${accessible ? " · accesible" : ""}`}
                  </title>
                  <rect
                    x={-7.5}
                    y={-6}
                    width={15}
                    height={12}
                    rx={3}
                    fill={STATUS_FILL[status]}
                    stroke={isSelected ? "#F8FAFC" : "#0B132B"}
                    strokeWidth={isSelected ? 2 : 0.6}
                  />
                  <text
                    y={1.5}
                    textAnchor="middle"
                    fill={status === "unassigned" ? "#0F172A" : "#fff"}
                    fontSize="7.5"
                    fontWeight="700"
                    transform={`rotate(${-deg})`}
                  >
                    {slot.number}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
