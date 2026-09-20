import type { RowSpec } from "../types";
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
