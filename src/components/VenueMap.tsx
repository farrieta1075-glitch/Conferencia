"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEventStore } from "@/context/EventStore";
import { useSalesFocus } from "@/context/SalesFocus";
import { COLORS, MAP } from "@/lib/constants";
import { seatId, money } from "@/lib/format";
import {
  annularSectorPath,
  aisleStripPath,
  polarAtFraction,
  buildSectionGeometry,
  sectionCentroid,
  stagePath,
  walkwayPath,
} from "@/lib/geometry";
import { boundsOf, sectionAtPoint, sectionOverlapsView, viewMapBounds, viewToMap } from "@/lib/mapView";
import { priceForSeat } from "@/lib/pricing";
import { buildSectionAlignLayout, type SectionAlignLayout } from "@/lib/tabulador/align";
import { sortedRows } from "@/lib/tabulador/seats";
import type { RowSpec, SeatRef, SeatStatus, SectionGeometry } from "@/lib/types";
import { PurchaseModal } from "./PurchaseModal";
import { RoleGate, useCan } from "./auth/RoleGate";
import { usePanZoom } from "./usePanZoom";

const STATUS_FILL: Record<SeatStatus, string> = {
  unassigned: COLORS.unassigned,
  available: COLORS.available,
  held: COLORS.held,
  sold: COLORS.sold,
};

const LEGEND: { label: string; color: string }[] = [
  { label: "Zona con venta", color: COLORS.saleZoneActive },
  { label: "No asignado", color: COLORS.unassigned },
  { label: "Disponible", color: COLORS.available },
  { label: "Apartado", color: COLORS.held },
  { label: "Vendido", color: COLORS.sold },
];

function sectionHasSale(
  sectionId: string,
  statusOf: (id: string) => SeatStatus,
  seatIndex: Map<string, { sectionId: string }>,
) {
  return countAvailable(sectionId, statusOf, seatIndex) > 0;
}

function countAvailable(
  sectionId: string,
  statusOf: (id: string) => SeatStatus,
  seatIndex: Map<string, { sectionId: string }>,
) {
  let count = 0;
  for (const [id, seat] of seatIndex) {
    if (seat.sectionId === sectionId && statusOf(id) === "available") count += 1;
  }
  return count;
}

interface VenueMapProps {
  focusSectionId?: string | null;
}

export function VenueMap({ focusSectionId = null }: VenueMapProps) {
  const { state, statusOf, seatIndex } = useEventStore();
  const salesFocus = useSalesFocus();
  const setFocus = salesFocus?.setFocus;
  const clearFocus = salesFocus?.clearFocus;
  const { transform, onPointerDown, onPointerMove, onPointerUp, onWheel, zoomAt, fitBounds, reset, suppressClick } =
    usePanZoom();
  const [probe, setProbe] = useState<{ x: number; y: number }>({
    x: MAP.originX,
    y: MAP.originY - 280,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const canSell = useCan("sales:create");

  const geometries = useMemo(
    () => buildSectionGeometry(state.tabulador),
    [state.tabulador],
  );

  const layouts = useMemo(() => {
    const map = new Map<string, { rows: RowSpec[]; align: SectionAlignLayout }>();
    for (const area of state.tabulador.areas) {
      for (const section of area.sections) {
        const rows = sortedRows(section.rows);
        map.set(section.id, { rows, align: buildSectionAlignLayout(rows) });
      }
    }
    return map;
  }, [state.tabulador]);

  const saleFlags = useMemo(() => {
    const flags = new Map<string, boolean>();
    for (const geo of geometries) {
      flags.set(geo.sectionId, sectionHasSale(geo.sectionId, statusOf, seatIndex));
    }
    return flags;
  }, [geometries, seatIndex, statusOf]);

  const viewCenter = viewToMap(
    MAP.viewX + MAP.viewW / 2,
    MAP.viewY + MAP.viewH / 2,
    transform,
  );
  const hovered = sectionAtPoint(geometries, probe.x, probe.y) ?? sectionAtPoint(geometries, viewCenter.x, viewCenter.y);
  const activeId = hovered?.sectionId ?? null;

  const seatSections = useMemo(() => {
    const ids = new Set<string>();
    if (transform.k < 1.55) return ids;
    const vis = viewMapBounds(transform);
    for (const geo of geometries) {
      if (sectionOverlapsView(geo, vis)) ids.add(geo.sectionId);
    }
    return ids;
  }, [geometries, transform]);

  useEffect(() => {
    if (!setFocus || !clearFocus) return;
    if (!activeId || transform.k < 1.25) {
      clearFocus();
      return;
    }
    setFocus({
      sectionId: activeId,
      label: activeId,
      available: countAvailable(activeId, statusOf, seatIndex),
    });
  }, [activeId, clearFocus, seatIndex, setFocus, statusOf, transform.k]);

  function zoomToSection(sectionId: string) {
    const geo = geometries.find((item) => item.sectionId === sectionId);
    if (!geo) return;
    const packed = layouts.get(sectionId);
    const points: { x: number; y: number }[] = [];
    if (packed) {
      packed.rows.forEach((row, rowIndex) => {
        for (const item of packed.align.rows[rowIndex] ?? []) {
          if (item.slot.kind !== "seat") continue;
          const id = seatId(sectionId, row.id, item.slot.number);
          if (statusOf(id) !== "available") continue;
          points.push(polarAtFraction(geo, rowIndex, packed.rows.length, item.t));
        }
      });
    }
    if (points.length) {
      const pad = 36;
      fitBounds(
        Math.min(...points.map((point) => point.x)) - pad,
        Math.min(...points.map((point) => point.y)) - pad,
        Math.max(...points.map((point) => point.x)) + pad,
        Math.max(...points.map((point) => point.y)) + pad,
      );
      return;
    }
    const box = boundsOf([geo]);
    fitBounds(box.minX, box.minY, box.maxX, box.maxY);
  }

  const fittedFromUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!focusSectionId || !geometries.length) return;
    if (fittedFromUrl.current === focusSectionId) return;
    fittedFromUrl.current = focusSectionId;
    zoomToSection(focusSectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSectionId, geometries, layouts]);

  const selectedSet = new Set(selected);
  const selectedSeats = selected
    .map((id) => seatIndex.get(id))
    .filter((seat): seat is SeatRef => Boolean(seat));
  const total = selectedSeats.reduce(
    (sum, seat) => sum + priceForSeat(seat, state.prices, state.promotions).price,
    0,
  );

  function focusSection(sectionId: string) {
    zoomToSection(sectionId);
  }

  function toggleSeat(id: string, status: SeatStatus) {
    if (!canSell || status !== "available") return;
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function handleReset() {
    setSelected([]);
    clearFocus?.();
    reset();
  }

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-bronze-dark">Mapa general</p>
          <h2 className="font-display text-xl text-ink lg:text-2xl">Auditorio Nacional</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost min-h-12 min-w-12 px-4 text-lg" onClick={() => zoomAt(1.35)}>
            +
          </button>
          <button type="button" className="btn-ghost min-h-12 min-w-12 px-4 text-lg" onClick={() => zoomAt(0.75)}>
            −
          </button>
          <button type="button" className="btn-ghost min-h-12 px-4" onClick={handleReset}>
            Ver todo
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-navy-deep">
        <svg
          viewBox={`${MAP.viewX} ${MAP.viewY} ${MAP.viewW} ${MAP.viewH}`}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={(event) => {
            const svg = event.currentTarget;
            const rect = svg.getBoundingClientRect();
            const vx = MAP.viewX + ((event.clientX - rect.left) / rect.width) * MAP.viewW;
            const vy = MAP.viewY + ((event.clientY - rect.top) / rect.height) * MAP.viewH;
            setProbe(viewToMap(vx, vy, transform));
            onPointerDown(event);
          }}
          onPointerMove={(event) => {
            const svg = event.currentTarget;
            const rect = svg.getBoundingClientRect();
            const vx = MAP.viewX + ((event.clientX - rect.left) / rect.width) * MAP.viewW;
            const vy = MAP.viewY + ((event.clientY - rect.top) / rect.height) * MAP.viewH;
            setProbe(viewToMap(vx, vy, transform));
            onPointerMove(event);
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(event) => {
            const svg = event.currentTarget;
            const rect = svg.getBoundingClientRect();
            const vx = MAP.viewX + ((event.clientX - rect.left) / rect.width) * MAP.viewW;
            const vy = MAP.viewY + ((event.clientY - rect.top) / rect.height) * MAP.viewH;
            setProbe(viewToMap(vx, vy, transform));
            onWheel(event);
          }}
          role="img"
          aria-label="Mapa interactivo del Auditorio Nacional"
        >
          <rect width={MAP.width} height={MAP.height} fill={COLORS.navyDeep} />
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            <path d={walkwayPath()} fill="#C5CAD3" />
            {geometries.map((geo) => {
              const onSale = saleFlags.get(geo.sectionId);
              const centroid = sectionCentroid(geo);
              const area = state.tabulador.areas.find((item) => item.id === geo.areaId);
              const angular = Math.abs(geo.thetaEnd - geo.thetaStart);
              const isPit = geo.sectionId === "101";
              const isActive = geo.sectionId === activeId;
              const showingSeats = seatSections.has(geo.sectionId);
              const fill = isPit ? "#C5CAD3" : onSale ? COLORS.saleZoneActive : "#1E4BA8";
              const fontSize = Math.max(
                8 / Math.sqrt(transform.k),
                Math.min(16, angular * 42 + (geo.rOuter - geo.rInner) / 18) /
                  Math.sqrt(transform.k),
              );
              const packed = layouts.get(geo.sectionId);
              return (
                <g key={geo.sectionId}>
                  <path
                    d={annularSectorPath(geo.rInner, geo.rOuter, geo.thetaStart, geo.thetaEnd)}
                    data-section-id={geo.sectionId}
                    fill={showingSeats ? "#0A1628" : fill}
                    stroke={isActive ? "#E8C39A" : "#F4F7FB"}
                    strokeWidth={(isActive ? 1.6 : 0.7) / transform.k}
                    className="cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (suppressClick.current) return;
                      focusSection(geo.sectionId);
                    }}
                  >
                    <title>{`${area?.name ?? ""} ${geo.sectionId}`}</title>
                  </path>
                  {showingSeats && packed
                    ? packed.align.aisles.map((aisle) => (
                        <path
                          key={`${geo.sectionId}-${aisle.id}`}
                          d={aisleStripPath(geo, aisle.t, aisle.width)}
                          fill="#060B18"
                          opacity="0.9"
                          className="pointer-events-none"
                        />
                      ))
                    : null}
                  {showingSeats && packed ? (
                    <SectionSeats
                      geo={geo}
                      rows={packed.rows}
                      align={packed.align}
                      zoom={transform.k}
                      selected={selectedSet}
                      statusOf={statusOf}
                      onSeatClick={toggleSeat}
                    />
                  ) : null}
                  {(!showingSeats || transform.k < 2.4) && (
                    <text
                      x={centroid.x}
                      y={centroid.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={isPit ? "#0B132B" : "#F8FAFC"}
                      fontSize={fontSize}
                      fontWeight={700}
                      className="pointer-events-none"
                      opacity={showingSeats ? 0.35 : 1}
                    >
                      {geo.sectionId}
                    </text>
                  )}
                </g>
              );
            })}
            <path d={stagePath()} fill="#C5CAD3" />
            <text
              x={MAP.originX}
              y={MAP.originY - 18}
              textAnchor="middle"
              fill="#0B132B"
              fontSize={16 / Math.sqrt(Math.max(transform.k, 1))}
              fontWeight="700"
              letterSpacing="3"
              className="pointer-events-none"
            >
              ESCENARIO
            </text>
          </g>
        </svg>
        <ul className="pointer-events-none absolute left-3 top-3 right-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-navy/80 px-3 py-2 text-[11px] text-white/90 backdrop-blur sm:right-auto">
          {LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-white/30"
                style={{ background: item.color }}
              />
              {item.label}
            </li>
          ))}
          <li className="text-white/70">Toca una zona para acercar sus asientos disponibles</li>
        </ul>
      </div>
      <RoleGate allow="sales:create">
        {!!selected.length && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
            <p className="text-sm text-ink-muted">
              {selected.length} asiento(s) · {money(total)}. Toca de nuevo para quitar.
            </p>
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              Comprar seleccionados · {money(total)}
            </button>
          </div>
        )}
        <PurchaseModal
          open={open}
          seats={selectedSeats}
          onClose={() => setOpen(false)}
          onCompleted={() => {
            setOpen(false);
            setSelected([]);
          }}
        />
      </RoleGate>
    </div>
  );
}

function SectionSeats({
  geo,
  rows,
  align,
  zoom,
  selected,
  statusOf,
  onSeatClick,
}: {
  geo: SectionGeometry;
  rows: RowSpec[];
  align: SectionAlignLayout;
  zoom: number;
  selected: Set<string>;
  statusOf: (id: string) => SeatStatus;
  onSeatClick: (id: string, status: SeatStatus) => void;
}) {
  const rowCount = Math.max(rows.length, 1);
  const rowH = (geo.rOuter - geo.rInner) / rowCount;
  const seatW = Math.max(2.4, Math.min(rowH * 0.52, 12));
  const showNumbers = seatW * zoom > 8;
  const hit = Math.max(seatW, 22 / zoom);
  return (
    <g>
      {rows.map((row, rowIndex) => {
        const placements = align.rows[rowIndex] ?? [];
        return placements.map((item) => {
          if (item.slot.kind !== "seat") return null;
          const point = polarAtFraction(geo, rowIndex, rowCount, item.t);
          const deg = (point.theta * 180) / Math.PI;
          const id = seatId(geo.sectionId, row.id, item.slot.number);
          const status = statusOf(id);
          const isSelected = selected.has(id);
          return (
            <g
              key={id}
              data-seat-id={id}
              data-seat-status={status}
              transform={`translate(${point.x} ${point.y}) rotate(${deg})`}
              className="cursor-pointer"
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.dataset.armed = "1";
              }}
              onPointerCancel={(event) => {
                delete event.currentTarget.dataset.armed;
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                if (event.currentTarget.dataset.armed !== "1") return;
                delete event.currentTarget.dataset.armed;
                if (event.button !== 0 && event.pointerType === "mouse") return;
                onSeatClick(id, status);
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <title>{`Fila ${row.id} asiento ${item.slot.number}`}</title>
              <rect
                x={-hit / 2}
                y={-hit / 2}
                width={hit}
                height={hit}
                fill="transparent"
              />
              <rect
                x={-seatW / 2}
                y={-seatW * 0.38}
                width={seatW}
                height={seatW * 0.76}
                rx={Math.min(2, seatW / 4)}
                fill={STATUS_FILL[status]}
                stroke={isSelected ? "#F8FAFC" : "#0B132B"}
                strokeWidth={(isSelected ? 1.4 : 0.35) / zoom}
              />
              {showNumbers ? (
                <text
                  y={1.1}
                  textAnchor="middle"
                  fill={status === "unassigned" ? "#0F172A" : "#fff"}
                  fontSize={Math.max(2.4, seatW * 0.42)}
                  fontWeight="700"
                  transform={`rotate(${-deg})`}
                  className="pointer-events-none"
                >
                  {item.slot.number}
                </text>
              ) : null}
            </g>
          );
        });
      })}
    </g>
  );
}
