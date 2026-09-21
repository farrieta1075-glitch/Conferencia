import type { PolarPoint, SectionGeometry, VenueTabulador } from "./types";
import { MAP } from "./constants";
import { FALLBACK_RINGS, SECTION_LAYOUT, WALKWAY, fallbackWedge, type Wedge } from "./layout";
import { canonicalizeSectionId } from "./tabulador/ids";

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

export function buildSectionGeometry(tabulador: VenueTabulador): SectionGeometry[] {
  const geometries: SectionGeometry[] = [];

  for (const area of tabulador.areas) {
    const unknown = area.sections.filter(
      (section) => !SECTION_LAYOUT[section.id] && !SECTION_LAYOUT[canonicalizeSectionId(section.id)],
    );
    let unknownIndex = 0;

    for (const section of area.sections) {
      const explicit = SECTION_LAYOUT[section.id] ?? SECTION_LAYOUT[canonicalizeSectionId(section.id)];
      const wedge: Wedge = explicit ?? fallbackWedge(area.id, unknownIndex++, unknown.length);
      geometries.push({
        sectionId: section.id,
        areaId: area.id,
        ...wedge,
      });
    }
  }

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
  const { t0, t1 } = sectionThetaRange(geometry);
  return polar(r, t0 + Math.min(1, Math.max(0, t)) * (t1 - t0));
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
