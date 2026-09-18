import { MAP } from "./constants";
import { polar } from "./geometry";
import type { PolarPoint, SectionGeometry } from "./types";

export function xyToPolar(x: number, y: number): { r: number; theta: number } {
  const dx = x - MAP.originX;
  const dy = MAP.originY - y;
  return { r: Math.hypot(dx, dy), theta: Math.atan2(dx, dy) };
}

export function viewToMap(
  viewX: number,
  viewY: number,
  transform: { x: number; y: number; k: number },
) {
  return {
    x: (viewX - transform.x) / transform.k,
    y: (viewY - transform.y) / transform.k,
  };
}

export function sectionContains(geo: SectionGeometry, r: number, theta: number) {
  return (
    r >= geo.rInner - 1 &&
    r <= geo.rOuter + 1 &&
    theta >= geo.thetaStart - 0.002 &&
    theta <= geo.thetaEnd + 0.002
  );
}

export function sectionAtPoint(geometries: SectionGeometry[], x: number, y: number) {
  const { r, theta } = xyToPolar(x, y);
  return geometries.find((geo) => sectionContains(geo, r, theta)) ?? null;
}

function thetaOverlap(a: SectionGeometry, b: SectionGeometry) {
  return Math.min(a.thetaEnd, b.thetaEnd) - Math.max(a.thetaStart, b.thetaStart) > 0.012;
}

function radiusOverlap(a: SectionGeometry, b: SectionGeometry) {
  return Math.min(a.rOuter, b.rOuter) - Math.max(a.rInner, b.rInner) > 8;
}

export interface SectionNeighbors {
  left?: SectionGeometry;
  right?: SectionGeometry;
  inward?: SectionGeometry;
  outward?: SectionGeometry;
}

export function findNeighbors(
  geometries: SectionGeometry[],
  sectionId: string,
): SectionNeighbors {
  const geo = geometries.find((item) => item.sectionId === sectionId);
  if (!geo) return {};
  const others = geometries.filter((item) => item.sectionId !== sectionId);
  const left = others
    .filter((item) => radiusOverlap(item, geo) && item.thetaEnd <= geo.thetaStart + 0.03)
    .sort((a, b) => b.thetaEnd - a.thetaEnd)[0];
  const right = others
    .filter((item) => radiusOverlap(item, geo) && item.thetaStart >= geo.thetaEnd - 0.03)
    .sort((a, b) => a.thetaStart - b.thetaStart)[0];
  const inward = others
    .filter((item) => thetaOverlap(item, geo) && item.rOuter <= geo.rInner + 18)
    .sort((a, b) => b.rOuter - a.rOuter)[0];
  const outward = others
    .filter((item) => thetaOverlap(item, geo) && item.rInner >= geo.rOuter - 18)
    .sort((a, b) => a.rInner - b.rInner)[0];
  return { left, right, inward, outward };
}

export function geometryPoints(geo: SectionGeometry): PolarPoint[] {
  return [
    polar(geo.rInner, geo.thetaStart),
    polar(geo.rInner, geo.thetaEnd),
    polar(geo.rOuter, geo.thetaStart),
    polar(geo.rOuter, geo.thetaEnd),
    polar((geo.rInner + geo.rOuter) / 2, (geo.thetaStart + geo.thetaEnd) / 2),
  ];
}

export function boundsOf(geos: SectionGeometry[]) {
  const points = geos.flatMap(geometryPoints);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}
