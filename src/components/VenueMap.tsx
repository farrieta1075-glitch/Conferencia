"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEventStore } from "@/context/EventStore";
import { useSalesFocus } from "@/context/SalesFocus";
import { COLORS, MAP } from "@/lib/constants";
import { seatId, money } from "@/lib/format";
import {
  annularSectorPath,
  aisleStripPath,
  polarAtRadius,
  sectionThetaRange,
  buildSectionGeometry,
  sectionCentroid,
  stagePath,
  walkwayPath,
} from "@/lib/geometry";
import { boundsOf, sectionAtPoint, sectionOverlapsView, viewMapBounds, viewToMap } from "@/lib/mapView";
import { priceForSeat } from "@/lib/pricing";
import { buildSectionAlignLayout, type SectionAlignLayout } from "@/lib/tabulador/align";
import { radiusForRow, resolveRowBands, rowDeltaR, type RowBandLayout } from "@/lib/tabulador/rowBands";
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

interface SeatHover {
  x: number;
  y: number;
  sectionId: string;
  rowId: string;
  number: number;
}

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
  const { transform, onPointerDown, onPointerMove, onPointerUp, onWheel, zoomAt, fitBounds, reset, suppressClick, liveGroupRef, gesturingRef } =
    usePanZoom();
  const [probe, setProbe] = useState<{ x: number; y: number }>({
    x: MAP.originX,
    y: MAP.originY - 280,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [hoverSeat, setHoverSeat] = useState<SeatHover | null>(null);
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

  const rowBands = useMemo(() => {
    const byArc = new Map<string, { rows: RowSpec[] }[]>();
    const members = new Map<string, string[]>();
    const geosByArc = new Map<string, SectionGeometry[]>();
    for (const geo of geometries) {
      const packed = layouts.get(geo.sectionId);
      if (!packed) continue;
      const key = `${geo.areaId}:${Math.round(geo.rOuter)}`;
      const list = byArc.get(key) ?? [];
      list.push({ rows: packed.rows });
      byArc.set(key, list);
      const ids = members.get(key) ?? [];
      ids.push(geo.sectionId);
      members.set(key, ids);
      const geos = geosByArc.get(key) ?? [];
      geos.push(geo);
      geosByArc.set(key, geos);
    }
    const result = new Map<string, RowBandLayout>();
    const delta = new Map<string, number>();
    for (const [key, sections] of byArc) {
      const layout = resolveRowBands(sections);
      const areaDelta = rowDeltaR(geosByArc.get(key) ?? [], layout.bands.length);
      for (const sectionId of members.get(key) ?? []) {
        result.set(sectionId, layout);
        delta.set(sectionId, areaDelta);
      }
    }
    return { bands: result, delta };
  }, [geometries, layouts]);

  const seatBox = useMemo(() => {
    const pitches: number[] = [];
    const rowHs: number[] = [];
    for (const geo of geometries) {
      const packed = layouts.get(geo.sectionId);
      const bands = rowBands.bands.get(geo.sectionId);
      if (!packed || packed.align.totalWeight < 6) continue;
      const bandCount = Math.max(bands?.bands.length ?? packed.rows.length, 1);
      rowHs.push((geo.rOuter - geo.rInner) / bandCount);
      const { t0, t1 } = sectionThetaRange(geo);
      const rFit = (geo.rInner + geo.rOuter) / 2;
      pitches.push((rFit * Math.abs(t1 - t0)) / packed.align.totalWeight);
    }
    pitches.sort((a, b) => a - b);
    rowHs.sort((a, b) => a - b);
    const pick = (values: number[], at: number, fallback: number) => {
      if (!values.length) return fallback;
      const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * at)));
      return values[index];
    };
    const w = Math.max(4.4, Math.min(pick(pitches, 0.35, 5.6) * 0.86, 6.4));
    const h = Math.max(3.6, Math.min(pick(rowHs, 0.35, 5.2) * 0.64, w * 0.88));
    return { w, h };
  }, [geometries, layouts, rowBands]);

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
    if (transform.k < 2.05) return ids;
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

  useEffect(() => () => clearFocus?.(), [clearFocus]);

  function zoomToSection(sectionId: string) {
    const geo = geometries.find((item) => item.sectionId === sectionId);
    if (!geo) return;
    const packed = layouts.get(sectionId);
    const points: { x: number; y: number }[] = [];
    if (packed) {
      const bands = rowBands.bands.get(sectionId);
      const deltaR = rowBands.delta.get(sectionId) ?? 8;
      packed.rows.forEach((row, rowIndex) => {
        for (const item of packed.align.rows[rowIndex] ?? []) {
          if (item.slot.kind !== "seat") continue;
          const id = seatId(sectionId, row.id, item.slot.number);
          if (statusOf(id) !== "available") continue;
          const radius = bands
            ? radiusForRow(geo, row.id, bands, deltaR, rowIndex)
            : geo.rInner + ((rowIndex + 0.55) / Math.max(packed.rows.length, 1)) * (geo.rOuter - geo.rInner);
          points.push(polarAtRadius(geo, radius, item.t));
        }
      });
    }
    const centroid = sectionCentroid(geo);
    setProbe({ x: centroid.x, y: centroid.y });
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
          <button type="button" className="btn-ghost min-h-12 min-w-12 px-4 text-lg" onClick={() => zoomAt(1.4)}>
            +
          </button>
          <button type="button" className="btn-ghost min-h-12 min-w-12 px-4 text-lg" onClick={() => zoomAt(0.7)}>
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
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing [&[data-gesturing]_[data-seat-id]]:pointer-events-none [&[data-gesturing]_text]:hidden"
          style={{ touchAction: "none" }}
          onPointerDown={(event) => {
            onPointerDown(event);
            if (gesturingRef.current) return;
            const svg = event.currentTarget;
            const rect = svg.getBoundingClientRect();
            const vx = MAP.viewX + ((event.clientX - rect.left) / rect.width) * MAP.viewW;
            const vy = MAP.viewY + ((event.clientY - rect.top) / rect.height) * MAP.viewH;
            setProbe(viewToMap(vx, vy, transform));
          }}
          onPointerMove={(event) => {
            onPointerMove(event);
            if (gesturingRef.current) return;
            const svg = event.currentTarget;
            const rect = svg.getBoundingClientRect();
            const vx = MAP.viewX + ((event.clientX - rect.left) / rect.width) * MAP.viewW;
            const vy = MAP.viewY + ((event.clientY - rect.top) / rect.height) * MAP.viewH;
            setProbe(viewToMap(vx, vy, transform));
            if (!(event.target instanceof Element) || !event.target.closest("[data-seat-id]")) {
              setHoverSeat(null);
            }
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={(event) => {
            setHoverSeat(null);
            onPointerUp(event);
          }}
          onPointerLeave={() => setHoverSeat(null)}
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
          <g
            ref={liveGroupRef}
            className="will-change-transform"
            transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
          >
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
                      bands={rowBands.bands.get(geo.sectionId)}
                      deltaR={rowBands.delta.get(geo.sectionId) ?? 8}
                      seatW={seatBox.w}
                      seatH={seatBox.h}
                      zoom={transform.k}
                      selected={selectedSet}
                      statusOf={statusOf}
                      onSeatClick={toggleSeat}
                      onSeatHover={(seat) => {
                        if (gesturingRef.current) return;
                        setHoverSeat(seat);
                      }}
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
          <li className="text-white/70">Toca una zona para acercar · cada asiento muestra fila y número (B36)</li>
        </ul>
        {hoverSeat
          ? createPortal(
              <div
                className="pointer-events-none fixed z-[80] rounded-lg bg-[#0B132B] px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-[#E8C39A]/60"
                style={{
                  left: Math.min(hoverSeat.x + 14, window.innerWidth - 220),
                  top: Math.min(hoverSeat.y + 16, window.innerHeight - 44),
                }}
              >
                Zona {hoverSeat.sectionId} · Fila {hoverSeat.rowId} · Asiento {hoverSeat.number}
              </div>,
              document.body,
            )
          : null}
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
  bands,
  deltaR,
  seatW,
  seatH,
  zoom,
  selected,
  statusOf,
  onSeatClick,
  onSeatHover,
}: {
  geo: SectionGeometry;
  rows: RowSpec[];
  align: SectionAlignLayout;
  bands?: RowBandLayout;
  deltaR: number;
  seatW: number;
  seatH: number;
  zoom: number;
  selected: Set<string>;
  statusOf: (id: string) => SeatStatus;
  onSeatClick: (id: string, status: SeatStatus) => void;
  onSeatHover: (seat: SeatHover | null) => void;
}) {
  const hit = Math.max(seatW, seatH, 18 / zoom);

  return (
    <g>
      {rows.map((row, rowIndex) => {
        const placements = align.rows[rowIndex] ?? [];
        return placements.map((item) => {
          if (item.slot.kind !== "seat") return null;
          const number = item.slot.number;
          const radius = bands
            ? radiusForRow(geo, row.id, bands, deltaR, rowIndex)
            : geo.rInner + ((rowIndex + 0.55) / Math.max(rows.length, 1)) * (geo.rOuter - geo.rInner);
          const point = polarAtRadius(geo, radius, item.t);
          const deg = (point.theta * 180) / Math.PI;
          const id = seatId(geo.sectionId, row.id, number);
          const status = statusOf(id);
          if (status === "unassigned" && zoom < 2.8) return null;
          const isSelected = selected.has(id);
          const code = `${row.id}${number}`;
          const codeSize = Math.min(seatH * 0.34, (seatW * 0.62) / Math.max(code.length * 0.7, 2));
          const showCode = seatW * zoom > 8.5;
          return (
            <g
              key={`${id}-${rowIndex}-${item.t}`}
              data-seat-id={id}
              data-seat-status={status}
              transform={`translate(${point.x} ${point.y}) rotate(${deg})`}
              className="cursor-pointer"
              onPointerDown={(event) => {
                event.currentTarget.dataset.armed = "1";
              }}
              onPointerMove={(event) => {
                onSeatHover({
                  x: event.clientX,
                  y: event.clientY,
                  sectionId: geo.sectionId,
                  rowId: row.id,
                  number,
                });
              }}
              onPointerLeave={() => onSeatHover(null)}
              onPointerCancel={(event) => {
                delete event.currentTarget.dataset.armed;
                onSeatHover(null);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.dataset.armed !== "1") return;
                delete event.currentTarget.dataset.armed;
                if (event.button !== 0 && event.pointerType === "mouse") return;
                onSeatClick(id, status);
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <rect
                x={-hit / 2}
                y={-hit / 2}
                width={hit}
                height={hit}
                fill="transparent"
              />
              <rect
                x={-seatW / 2}
                y={-seatH / 2}
                width={seatW}
                height={seatH}
                rx={Math.min(1.6, seatW / 5)}
                fill={STATUS_FILL[status]}
                stroke={isSelected ? "#F8FAFC" : "#0B132B"}
                strokeWidth={(isSelected ? 1.2 : 0.32) / zoom}
              />
              {showCode ? (
                <text
                  y={codeSize * 0.08}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={status === "unassigned" ? "#0B132B" : "#F8FAFC"}
                  stroke={status === "unassigned" ? "#F8FAFC" : "#060B18"}
                  strokeWidth={Math.max(0.2, codeSize * 0.055)}
                  paintOrder="stroke"
                  fontSize={codeSize}
                  fontWeight="700"
                  textLength={seatW * 0.74}
                  lengthAdjust="spacingAndGlyphs"
                  className="pointer-events-none"
                >
                  {code}
                </text>
              ) : null}
            </g>
          );
        });
      })}
    </g>
  );
}

