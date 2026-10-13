import type { PolarPoint, SectionGeometry, SectionSpec, VenueTabulador } from "./types";
import { MAP } from "./constants";
import { FALLBACK_RINGS, SECTION_LAYOUT, WALKWAY, fallbackWedge, type Wedge } from "./layout";
import { buildSectionAlignLayout } from "./tabulador/align";
import { canonicalizeSectionId } from "./tabulador/ids";
import { sortedRows } from "./tabulador/seats";

export function polar(r: number, theta: number): PolarPoint {
  return {
    r,
    theta,
    x: MAP.originX + r * Math.sin(theta),
    y: MAP.originY - r * Math.cos(theta),
  };
}

export function annularSectorPath(
  rInner: number,
  rOuter: number,
  thetaStart: number,
  thetaEnd: number,
  inset = 0,
): string {
  const r0 = rInner + inset;
  const r1 = rOuter - inset;
  const a0 = thetaStart;
  const a1 = thetaEnd;
  const a = polar(r1, a0);
  const b = polar(r1, a1);
  const c = polar(r0, a1);
  const d = polar(r0, a0);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return [
    `M ${a.x} ${a.y}`,
    `A ${r1} ${r1} 0 ${large} 1 ${b.x} ${b.y}`,
    `L ${c.x} ${c.y}`,
    `A ${r0} ${r0} 0 ${large} 0 ${d.x} ${d.y}`,
    "Z",
  ].join(" ");
}

export function walkwayPath(): string {
  return annularSectorPath(WALKWAY.rInner, WALKWAY.rOuter, WALKWAY.thetaStart, WALKWAY.thetaEnd, 0);
}

function sectionArcWeight(section: SectionSpec): number {
  const rows = sortedRows(section.rows);
  if (!rows.length) return 1;
  return Math.max(buildSectionAlignLayout(rows).totalWeight, 1);
}

function ringKey(geo: SectionGeometry) {
  return `${geo.areaId}:${Math.round(geo.rInner)}:${Math.round(geo.rOuter)}`;
}

function wedgeIdentity(geo: SectionGeometry) {
  return `${ringKey(geo)}:${geo.thetaStart.toFixed(5)}:${geo.thetaEnd.toFixed(5)}`;
}

function redistributeRingThetas(
  geometries: SectionGeometry[],
  weightOf: (sectionId: string) => number,
) {
  type Slot = {
    geos: SectionGeometry[];
    weight: number;
    start: number;
    end: number;
  };
  const slots = new Map<string, Slot>();
  for (const geo of geometries) {
    const key = wedgeIdentity(geo);
    const weight = weightOf(geo.sectionId);
    const existing = slots.get(key);
    if (existing) {
      existing.geos.push(geo);
      existing.weight = Math.max(existing.weight, weight);
    } else {
      slots.set(key, {
        geos: [geo],
        weight,
        start: geo.thetaStart,
        end: geo.thetaEnd,
      });
    }
  }

  const byRing = new Map<string, Slot[]>();
  for (const slot of slots.values()) {
    const key = ringKey(slot.geos[0]);
    const list = byRing.get(key) ?? [];
    list.push(slot);
    byRing.set(key, list);
  }

  for (const ringSlots of byRing.values()) {
    if (ringSlots[0]?.geos[0]?.areaId === "segundo-piso") continue;
    ringSlots.sort((a, b) => (a.start + a.end) / 2 - (b.start + b.end) / 2);
    const clusters: Slot[][] = [];
    let current: Slot[] = [ringSlots[0]];
    for (let i = 1; i < ringSlots.length; i += 1) {
      const prev = current[current.length - 1];
      if (ringSlots[i].start <= prev.end + 0.018) {
        current.push(ringSlots[i]);
      } else {
        clusters.push(current);
        current = [ringSlots[i]];
      }
    }
    clusters.push(current);

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const left = cluster[0].start;
      const right = cluster[cluster.length - 1].end;
      const span = right - left;
      const sum = cluster.reduce((total, slot) => total + slot.weight, 0) || 1;
      let cursor = left;
      for (const slot of cluster) {
        const next = cursor + span * (slot.weight / sum);
        for (const geo of slot.geos) {
          geo.thetaStart = cursor;
          geo.thetaEnd = next;
        }
        cursor = next;
      }
    }
  }
}

function stackUpperFloor(geometries: SectionGeometry[]) {
  const byId = new Map<string, SectionGeometry>();
  for (const geo of geometries) {
    const id = canonicalizeSectionId(geo.sectionId);
    const current = byId.get(id);
    if (!current || geo.areaId === "primer-piso") byId.set(id, geo);
  }
  for (const geo of geometries) {
    const id = canonicalizeSectionId(geo.sectionId);
    const number = Number(id);
    if (!Number.isFinite(number) || number < 500 || number >= 600) continue;
    const below = byId.get(String(number - 100));
    if (!below) continue;
    geo.thetaStart = below.thetaStart;
    geo.thetaEnd = below.thetaEnd;
  }
}

export function buildSectionGeometry(tabulador: VenueTabulador): SectionGeometry[] {
  const geometries: SectionGeometry[] = [];
  const weights = new Map<string, number>();

  for (const area of tabulador.areas) {
    const known: { section: (typeof area.sections)[number]; wedge: Wedge }[] = [];
    const unknown: typeof area.sections = [];
    for (const section of area.sections) {
      weights.set(section.id, sectionArcWeight(section));
      const explicit = SECTION_LAYOUT[section.id] ?? SECTION_LAYOUT[canonicalizeSectionId(section.id)];
      if (explicit) known.push({ section, wedge: explicit });
      else unknown.push(section);
    }

    for (const { section, wedge } of known) {
      geometries.push({
        sectionId: section.id,
        areaId: area.id,
        ...wedge,
      });
    }

    const occupied = known.map((item) => item.wedge);
    unknown.forEach((section, index) => {
      const wedge = fallbackWedge(area.id, index, unknown.length, occupied);
      geometries.push({
        sectionId: section.id,
        areaId: area.id,
        ...wedge,
      });
    });
  }

  redistributeRingThetas(geometries, (sectionId) => weights.get(sectionId) ?? 1);
  stackUpperFloor(geometries);
  return geometries;
}

export function sectionCentroid(geometry: SectionGeometry): PolarPoint {
  const theta = (geometry.thetaStart + geometry.thetaEnd) / 2;
  const r = (geometry.rInner + geometry.rOuter) / 2;
  return polar(r, theta);
}

export function sectionThetaRange(geometry: SectionGeometry) {
  const span = geometry.thetaEnd - geometry.thetaStart;
  const margin = Math.min(0.028 * Math.abs(span), 0.04);
  return {
    t0: geometry.thetaStart + Math.sign(span || 1) * margin,
    t1: geometry.thetaEnd - Math.sign(span || 1) * margin,
  };
}

export function polarAtFraction(
  geometry: SectionGeometry,
  rowIndex: number,
  rowCount: number,
  t: number,
): PolarPoint {
  const rowT = (rowIndex + 0.55) / Math.max(rowCount, 1);
  const r = geometry.rInner + rowT * (geometry.rOuter - geometry.rInner);
  return polarAtRadius(geometry, r, t);
}

export function polarAtRadius(geometry: SectionGeometry, radius: number, t: number): PolarPoint {
  const { t0, t1 } = sectionThetaRange(geometry);
  return polar(radius, t0 + Math.min(1, Math.max(0, t)) * (t1 - t0));
}

export function aisleStripPath(geometry: SectionGeometry, t: number, width = 0.04): string {
  const { t0, t1 } = sectionThetaRange(geometry);
  const theta = t0 + t * (t1 - t0);
  const half = ((t1 - t0) * Math.max(width, 0.02)) / 2;
  return annularSectorPath(geometry.rInner + 8, geometry.rOuter - 4, theta - half, theta + half, 0);
}

export function stagePath(): string {
  const top = polar(108, 0);
  const left = polar(118, -36 * (Math.PI / 180));
  const right = polar(118, 36 * (Math.PI / 180));
  const lipL = polar(28, -42 * (Math.PI / 180));
  const lipR = polar(28, 42 * (Math.PI / 180));
  return `M ${left.x} ${left.y} Q ${top.x} ${top.y - 8} ${right.x} ${right.y} L ${lipR.x} ${lipR.y + 10} Q ${MAP.originX} ${MAP.originY + 8} ${lipL.x} ${lipL.y + 10} Z`;
}

export { FALLBACK_RINGS };
