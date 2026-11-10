"use client";

import { useEffect, useMemo, useState } from "react";
import { COLORS, MAP } from "@/lib/constants";
import { parseSeatId, seatId } from "@/lib/format";
import {
  annularSectorPath,
  buildSectionGeometry,
  polarAtRadius,
  sectionCentroid,
  sectionThetaRange,
  stagePath,
  walkwayPath,
} from "@/lib/geometry";
import { boundsOf } from "@/lib/mapView";
import { buildSectionAlignLayout } from "@/lib/tabulador/align";
import { radiusForRow, resolveRowBands, rowDeltaR } from "@/lib/tabulador/rowBands";
import { sortedRows } from "@/lib/tabulador/seats";
import type { SeatStatus, VenueTabulador } from "@/lib/types";

const LEVELS = ["Auditorio", "Zona", "Asientos"] as const;

function padBox(
  box: { minX: number; maxX: number; minY: number; maxY: number },
  ratio: number,
  minSize = 24,
) {
  const w = Math.max(box.maxX - box.minX, minSize);
  const h = Math.max(box.maxY - box.minY, minSize);
  const pad = Math.max(w, h) * ratio;
  return {
    x: box.minX - pad,
    y: box.minY - pad,
    w: w + pad * 2,
    h: h + pad * 2,
  };
}

export function PurchaseSeatTour({
  seatIds,
  statusOf,
  tabulador,
}: {
  seatIds: string[];
  statusOf: (id: string) => SeatStatus;
  tabulador: VenueTabulador;
}) {
  const [level, setLevel] = useState(0);
  const selected = useMemo(() => new Set(seatIds), [seatIds]);
  const sectionIds = useMemo(
    () => new Set(seatIds.map((id) => id.split("|")[0] ?? "")),
    [seatIds],
  );

  useEffect(() => {
    setLevel(0);
  }, [seatIds.join("|")]);

  const geometries = useMemo(() => buildSectionGeometry(tabulador), [tabulador]);
  const layouts = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildSectionAlignLayout>>();
    const rows = new Map<string, ReturnType<typeof sortedRows>>();
    for (const area of tabulador.areas) {
      for (const section of area.sections) {
        const list = sortedRows(section.rows);
        rows.set(section.id, list);
        map.set(section.id, buildSectionAlignLayout(list));
      }
    }
    return { map, rows };
  }, [tabulador]);

  const bands = useMemo(() => {
    const byArc = new Map<string, { rows: ReturnType<typeof sortedRows> }[]>();
    const members = new Map<string, string[]>();
    const geosByArc = new Map<string, typeof geometries>();
    for (const geo of geometries) {
      const packed = layouts.rows.get(geo.sectionId);
      if (!packed) continue;
      const key = `${geo.areaId}:${Math.round(geo.rOuter)}`;
      const list = byArc.get(key) ?? [];
      list.push({ rows: packed });
      byArc.set(key, list);
      const ids = members.get(key) ?? [];
      ids.push(geo.sectionId);
      members.set(key, ids);
      const geos = geosByArc.get(key) ?? [];
      geos.push(geo);
      geosByArc.set(key, geos);
    }
    const result = new Map<string, ReturnType<typeof resolveRowBands>>();
    const delta = new Map<string, number>();
    for (const [key, sections] of byArc) {
      const layout = resolveRowBands(sections);
      const areaDelta = rowDeltaR(geosByArc.get(key) ?? [], layout.bands.length);
      for (const sectionId of members.get(key) ?? []) {
        result.set(sectionId, layout);
        delta.set(sectionId, areaDelta);
      }
    }
    return { result, delta };
  }, [geometries, layouts]);

  const seats = useMemo(() => {
    const points: {
      id: string;
      x: number;
      y: number;
      theta: number;
      w: number;
      h: number;
      status: SeatStatus;
      code: string;
    }[] = [];
    for (const geo of geometries) {
      const align = layouts.map.get(geo.sectionId);
      const rows = layouts.rows.get(geo.sectionId);
      if (!align || !rows) continue;
      const band = bands.result.get(geo.sectionId);
      const deltaR = bands.delta.get(geo.sectionId) ?? 8;
      const { t0, t1 } = sectionThetaRange(geo);
      const rFit = (geo.rInner + geo.rOuter) / 2;
      const pitch = (rFit * Math.abs(t1 - t0)) / Math.max(align.totalWeight, 1);
      const bandCount = Math.max(band?.bands.length ?? rows.length, 1);
      const rowH = (geo.rOuter - geo.rInner) / bandCount;
      const w = Math.max(1.2, Math.min(6.2, pitch * 0.84));
      const h = Math.max(1, Math.min(5.2, rowH * 0.62, w * 0.9));
      rows.forEach((row, rowIndex) => {
        const placements = align.rows[rowIndex] ?? [];
        for (const item of placements) {
          if (item.slot.kind !== "seat") continue;
          const id = seatId(geo.sectionId, row.id, item.slot.number);
          const inPurchase = selected.has(id);
          if (level === 0 && !inPurchase) continue;
          if (level >= 1 && !sectionIds.has(geo.sectionId)) continue;
          const radius = band
            ? radiusForRow(geo, row.id, band, deltaR, rowIndex)
            : geo.rInner + ((rowIndex + 0.55) / Math.max(rows.length, 1)) * (geo.rOuter - geo.rInner);
          const point = polarAtRadius(geo, radius, item.t);
          const status = inPurchase ? statusOf(id) : "unassigned";
          const parsed = parseSeatId(id);
          points.push({
            id,
            x: point.x,
            y: point.y,
            theta: point.theta,
            w,
            h,
            status,
            code: `${parsed.rowId}${parsed.number}`,
          });
        }
      });
    }
    return points;
  }, [bands, geometries, layouts, level, sectionIds, selected, statusOf]);

  const view = useMemo(() => {
    if (level === 0) {
      return { x: MAP.viewX, y: MAP.viewY, w: MAP.viewW, h: MAP.viewH };
    }
    if (level === 1) {
      const zoneGeos = geometries.filter((geo) => sectionIds.has(geo.sectionId));
      return padBox(boundsOf(zoneGeos.length ? zoneGeos : geometries), 0.22);
    }
    const xs = seats.filter((seat) => selected.has(seat.id)).map((seat) => seat.x);
    const ys = seats.filter((seat) => selected.has(seat.id)).map((seat) => seat.y);
    if (!xs.length) {
      return { x: MAP.viewX, y: MAP.viewY, w: MAP.viewW, h: MAP.viewH };
    }
    return padBox(
      { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
      0.55,
      8,
    );
  }, [geometries, level, seats, sectionIds, selected]);

  const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;
  const scaleHint = level === 0 ? 2.8 : level === 1 ? 1.35 : 1;

  function inView(x: number, y: number, pad = 0) {
    return x >= view.x - pad && x <= view.x + view.w + pad && y >= view.y - pad && y <= view.y + view.h + pad;
  }

  return (
    <div className="shrink-0 overflow-hidden rounded-2xl bg-navy-deep">
      <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-white/80">
        <span>{LEVELS[level]}</span>
        <span>Clic para acercar · {level + 1} / {LEVELS.length}</span>
      </div>
      <button
        type="button"
        className="block w-full cursor-pointer"
        aria-label={`Mapa de asientos: ${LEVELS[level]}. Clic para ${level === 2 ? "volver al auditorio" : "acercar"}`}
        onClick={() => setLevel((current) => (current + 1) % LEVELS.length)}
      >
        <svg
          viewBox={viewBox}
          className="h-56 w-full touch-none sm:h-72"
          style={{ touchAction: "none", pointerEvents: "none" }}
          role="img"
          aria-hidden="true"
        >
          <rect width={MAP.width} height={MAP.height} fill={COLORS.navyDeep} />
          <path d={walkwayPath()} fill="#C5CAD3" />
          <path d={stagePath()} fill="#E8C39A" opacity="0.85" />
          {geometries.map((geo) => {
            const involved = sectionIds.has(geo.sectionId);
            const fill = involved && level > 0 ? "#0A1628" : involved ? COLORS.saleZoneActive : "#1E4BA8";
            const centroid = sectionCentroid(geo);
            return (
              <g key={geo.sectionId}>
                <path
                  d={annularSectorPath(geo.rInner, geo.rOuter, geo.thetaStart, geo.thetaEnd)}
                  fill={fill}
                  stroke="#F4F7FB"
                  strokeWidth={level === 0 ? 0.7 : 0.45}
                />
                {level < 2 ? (
                  <text
                    x={centroid.x}
                    y={centroid.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#F8FAFC"
                    fontSize={level === 0 ? 11 : 8}
                    fontWeight="700"
                  >
                    {geo.sectionId}
                  </text>
                ) : null}
              </g>
            );
          })}
          {seats.map((seat) => {
            const owned = selected.has(seat.id);
            const fill =
              seat.status === "sold" ? COLORS.sold : seat.status === "held" ? COLORS.held : COLORS.unassigned;
            const w = seat.w * (owned && level === 0 ? scaleHint : 1);
            const h = seat.h * (owned && level === 0 ? scaleHint : 1);
            const deg = (seat.theta * 180) / Math.PI;
            const visible = level < 2 || owned || inView(seat.x, seat.y);
            const showCode =
              level === 1 || (level === 2 && visible && (owned || inView(seat.x, seat.y, -seat.w * 0.2)));
            const codeSize =
              level === 2
                ? Math.min(h * 0.42, (w * 0.78) / Math.max(seat.code.length * 0.62, 2))
                : Math.min(h * 0.28, (w * 0.7) / Math.max(seat.code.length * 0.7, 2));
            return (
              <g key={seat.id} transform={`translate(${seat.x} ${seat.y}) rotate(${deg})`}>
                <rect
                  x={-w / 2}
                  y={-h / 2}
                  width={w}
                  height={h}
                  rx={Math.min(1.6, w / 5)}
                  fill={fill}
                  stroke={owned ? "#F8FAFC" : "#0B132B"}
                  strokeWidth={owned ? 0.9 : 0.25}
                />
                {showCode && codeSize >= 0.55 ? (
                  <text
                    y={codeSize * 0.08}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={owned ? "#F8FAFC" : "#0B132B"}
                    stroke={owned ? "#060B18" : "#F8FAFC"}
                    strokeWidth={Math.max(0.12, codeSize * 0.05)}
                    paintOrder="stroke"
                    fontSize={codeSize}
                    fontWeight="700"
                    textLength={w * 0.74}
                    lengthAdjust="spacingAndGlyphs"
                  >
                    {seat.code}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </button>
    </div>
  );
}
