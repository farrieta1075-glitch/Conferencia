import type { RowSpec, SectionGeometry } from "../types";
import { sortedRows } from "./seats";

export interface RowBandLayout {
  bands: string[];
  index: Map<string, number>;
}

function letterCompare(a: string, b: string) {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

/**
 * Orders row letters across sections that share a ring so "D" in 201
 * sits on the same radius as "D" in 202/203, even if 201 has no A–C.
 */
export function resolveRowBands(sections: { rows: RowSpec[] }[]): RowBandLayout {
  const ids = new Set<string>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, Set<string>>();

  function ensure(id: string) {
    ids.add(id);
    if (!incoming.has(id)) incoming.set(id, 0);
    if (!outgoing.has(id)) outgoing.set(id, new Set());
  }

  for (const section of sections) {
    const rows = sortedRows(section.rows);
    for (const row of rows) ensure(row.id);
    for (let i = 0; i < rows.length - 1; i += 1) {
      const from = rows[i].id;
      const to = rows[i + 1].id;
      if (from === to) continue;
      const next = outgoing.get(from);
      if (!next || next.has(to)) continue;
      next.add(to);
      incoming.set(to, (incoming.get(to) ?? 0) + 1);
    }
  }

  const ready = [...ids].filter((id) => (incoming.get(id) ?? 0) === 0).sort(letterCompare);
  const bands: string[] = [];
  while (ready.length) {
    const id = ready.shift();
    if (!id) break;
    bands.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const remaining = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, remaining);
      if (remaining === 0) {
        ready.push(next);
        ready.sort(letterCompare);
      }
    }
  }

  for (const id of [...ids].sort(letterCompare)) {
    if (!bands.includes(id)) bands.push(id);
  }

  return {
    bands,
    index: new Map(bands.map((id, i) => [id, i])),
  };
}

export function rowDeltaR(
  geometries: Pick<SectionGeometry, "rInner" | "rOuter">[],
  bandCount: number,
): number {
  const n = Math.max(bandCount, 1);
  let min = Infinity;
  for (const geo of geometries) {
    const height = geo.rOuter - geo.rInner;
    if (height > 4) min = Math.min(min, height / n);
  }
  return Number.isFinite(min) ? min : 8;
}

/** Same letter sits on the same arc, anchored from the back of the hall. */
export function radiusForRow(
  geo: Pick<SectionGeometry, "rInner" | "rOuter">,
  rowId: string,
  bands: RowBandLayout,
  deltaR: number,
  fallbackIndex = 0,
): number {
  const n = Math.max(bands.bands.length, 1);
  const index = bands.index.get(rowId) ?? fallbackIndex;
  const fromOuter = n - 1 - index + 0.45;
  const r = geo.rOuter - fromOuter * Math.max(deltaR, 1);
  const pad = Math.min(Math.max(deltaR * 0.12, 1.2), (geo.rOuter - geo.rInner) * 0.18);
  return Math.min(geo.rOuter - pad, Math.max(geo.rInner + pad, r));
}
