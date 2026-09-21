import type { RowSpec, SeatSlot } from "../types";
import { rowSlots, slotWeight } from "./seats";

const SEAT_WEIGHT = 1;
const AISLE_WEIGHT = 2.2;

export interface AlignedSlot {
  slot: SeatSlot;
  t: number;
}

export interface AisleBand {
  id: "P1" | "P2";
  t: number;
  width: number;
}

export interface SectionAlignLayout {
  totalWeight: number;
  aisles: AisleBand[];
  rows: AlignedSlot[][];
}

function splitByAisles(slots: SeatSlot[]): { blocks: SeatSlot[][]; aisles: ("P1" | "P2")[] } {
  const blocks: SeatSlot[][] = [[]];
  const aisles: ("P1" | "P2")[] = [];
  for (const slot of slots) {
    if (slot.kind === "aisle") {
      aisles.push(slot.id);
      blocks.push([]);
    } else {
      blocks[blocks.length - 1].push(slot);
    }
  }
  return { blocks, aisles };
}

function globalAisleOrder(rows: { aisles: ("P1" | "P2")[] }[]): ("P1" | "P2")[] {
  const order: ("P1" | "P2")[] = [];
  for (const row of rows) {
    for (const id of row.aisles) {
      if (!order.includes(id)) order.push(id);
    }
  }
  if (order.includes("P1") && order.includes("P2") && order.indexOf("P2") < order.indexOf("P1")) {
    return ["P1", "P2"];
  }
  return order;
}

function splitByWeights(slots: SeatSlot[], weights: number[]): SeatSlot[][] {
  if (!weights.length) return [];
  if (weights.length === 1) return [slots];
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const raw = weights.map((weight) => (slots.length * weight) / total);
  const sizes = raw.map((value) => Math.floor(value));
  let used = sizes.reduce((sum, size) => sum + size, 0);
  const remainders = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; used < slots.length; i += 1) {
    sizes[remainders[i % remainders.length].index] += 1;
    used += 1;
  }
  const result: SeatSlot[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    result.push(slots.slice(cursor, cursor + size));
    cursor += size;
  }
  return result;
}

function emptyBlocks(count: number): SeatSlot[][] {
  return Array.from({ length: count }, () => []);
}

function mapRowToGlobalBlocks(
  rowBlocks: SeatSlot[][],
  rowAisles: ("P1" | "P2")[],
  aisleOrder: ("P1" | "P2")[],
  blockWeights: number[],
): SeatSlot[][] {
  const blockCount = aisleOrder.length + 1;
  const result = emptyBlocks(blockCount);
  if (!aisleOrder.length) {
    result[0] = [...(rowBlocks[0] ?? [])];
    return result;
  }

  const fillRange = (from: number, to: number, slots: SeatSlot[]) => {
    if (from > to || !slots.length) return;
    const targets = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const parts = splitByWeights(
      slots,
      targets.map((index) => blockWeights[index] || 1),
    );
    parts.forEach((part, i) => {
      result[targets[i]] = part;
    });
  };

  if (!rowAisles.length) {
    fillRange(0, blockCount - 1, rowBlocks[0] ?? []);
    return result;
  }

  let nextBlock = 0;
  for (let i = 0; i < rowAisles.length; i += 1) {
    const dest = aisleOrder.indexOf(rowAisles[i]);
    const before = dest >= 0 ? dest : nextBlock;
    fillRange(nextBlock, Math.max(before, nextBlock), rowBlocks[i] ?? []);
    nextBlock = before + 1;
  }
  fillRange(nextBlock, blockCount - 1, rowBlocks[rowAisles.length] ?? []);
  return result;
}

function blockMaxCounts(
  split: { blocks: SeatSlot[][]; aisles: ("P1" | "P2")[] }[],
  aisleOrder: ("P1" | "P2")[],
): number[] {
  const blockCount = aisleOrder.length + 1;
  const complete = split.filter(
    (row) => aisleOrder.every((id) => row.aisles.includes(id)) && row.aisles.length === aisleOrder.length,
  );
  const source = complete.length ? complete : split;
  const equalWeights = Array.from({ length: blockCount }, () => 1);
  const mapped = source.map((row) =>
    mapRowToGlobalBlocks(row.blocks, row.aisles, aisleOrder, equalWeights),
  );
  return Array.from({ length: blockCount }, (_, index) =>
    Math.max(1, ...mapped.map((blocks) => blocks[index]?.length ?? 0)),
  );
}

function positionInBands(bands: { start: number; end: number }[], offset: number): number {
  let remaining = Math.max(offset, 0);
  for (const band of bands) {
    const width = Math.max(band.end - band.start, 0);
    if (remaining <= width) return band.start + remaining;
    remaining -= width;
  }
  return bands[bands.length - 1]?.end ?? 0;
}

function packSlotsAcrossBands(
  slots: SeatSlot[],
  bands: { start: number; end: number }[],
  totalWeight: number,
  pin: "start" | "end" | "center",
): AlignedSlot[] {
  if (!slots.length || !bands.length) return [];
  const weights = slots.map((slot) => (slot.kind === "seat" ? SEAT_WEIGHT : Math.max(slotWeight(slot), 0.3)));
  const usable = bands.reduce((sum, band) => sum + Math.max(band.end - band.start, 0), 0);
  let leftover = usable - weights.reduce((sum, weight) => sum + weight, 0);
  const gapIdx = slots
    .map((slot, index) => (slot.kind === "clear" || slot.kind === "empty" ? index : -1))
    .filter((index) => index >= 0);

  if (leftover > 0.001 && gapIdx.length) {
    const add = leftover / gapIdx.length;
    for (const index of gapIdx) weights[index] += add;
    leftover = 0;
  } else if (leftover < -0.001 && gapIdx.length) {
    let deficit = -leftover;
    for (const index of gapIdx) {
      const cut = Math.min(Math.max(weights[index] - 0.22, 0), deficit);
      weights[index] -= cut;
      deficit -= cut;
    }
    leftover = usable - weights.reduce((sum, weight) => sum + weight, 0);
  }

  const gaps = slots.map(() => 0);
  let pad = 0;
  if (leftover > 0.001 && !gapIdx.length && slots.length > 1) {
    const add = leftover / (slots.length - 1);
    for (let i = 0; i < slots.length - 1; i += 1) gaps[i] = add;
  } else if (leftover > 0.001) {
    if (pin === "end") pad = leftover;
    else if (pin === "center") pad = leftover / 2;
  }

  let offset = pad;
  return slots.map((slot, index) => {
    const weight = weights[index];
    const t = positionInBands(bands, offset + weight / 2) / totalWeight;
    offset += weight + gaps[index];
    return { slot, t };
  });
}

function rowSegmentRanges(
  rowBlocks: SeatSlot[][],
  rowAisles: ("P1" | "P2")[],
  aisleOrder: ("P1" | "P2")[],
): { from: number; to: number; slots: SeatSlot[]; aisleAfter?: "P1" | "P2" }[] {
  const blockCount = aisleOrder.length + 1;
  if (!aisleOrder.length) {
    return [{ from: 0, to: 0, slots: rowBlocks[0] ?? [] }];
  }
  if (!rowAisles.length) {
    return [{ from: 0, to: blockCount - 1, slots: rowBlocks[0] ?? [] }];
  }

  const segments: { from: number; to: number; slots: SeatSlot[]; aisleAfter?: "P1" | "P2" }[] = [];
  let nextBlock = 0;
  for (let i = 0; i < rowAisles.length; i += 1) {
    const dest = aisleOrder.indexOf(rowAisles[i]);
    const before = dest >= 0 ? dest : nextBlock;
    const from = nextBlock;
    const to = Math.max(before, nextBlock);
    if (from <= to) {
      segments.push({ from, to, slots: rowBlocks[i] ?? [], aisleAfter: rowAisles[i] });
    }
    nextBlock = before + 1;
  }
  if (nextBlock <= blockCount - 1) {
    segments.push({ from: nextBlock, to: blockCount - 1, slots: rowBlocks[rowAisles.length] ?? [] });
  }
  return segments;
}

function pinForSegment(from: number, to: number, blockCount: number): "start" | "end" | "center" {
  if (blockCount <= 1 || (from === 0 && to >= blockCount - 1)) return "center";
  if (from === 0) return "start";
  if (to >= blockCount - 1) return "end";
  return "center";
}

export function buildSectionAlignLayout(rows: RowSpec[]): SectionAlignLayout {
  const split = rows.map((row) => splitByAisles(rowSlots(row)));
  const aisleOrder = globalAisleOrder(split);
  const blockCount = aisleOrder.length + 1;
  const maxCounts = blockMaxCounts(split, aisleOrder);

  const bands: { type: "block" | "aisle"; id?: "P1" | "P2"; start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < blockCount; i += 1) {
    const start = cursor;
    cursor += maxCounts[i] * SEAT_WEIGHT;
    bands.push({ type: "block", start, end: cursor });
    if (aisleOrder[i]) {
      const aisleStart = cursor;
      cursor += AISLE_WEIGHT;
      bands.push({ type: "aisle", id: aisleOrder[i], start: aisleStart, end: cursor });
    }
  }
  const totalWeight = cursor || 1;
  const blockBands = bands.filter((band) => band.type === "block");
  const aisleWidth = AISLE_WEIGHT / totalWeight;
  const aisles: AisleBand[] = bands
    .filter((band): band is typeof band & { id: "P1" | "P2" } => band.type === "aisle" && !!band.id)
    .map((band) => ({
      id: band.id,
      t: (band.start + band.end) / 2 / totalWeight,
      width: aisleWidth,
    }));

  const alignedRows = split.map((row) => {
    const placements: AlignedSlot[] = [];
    const segments = rowSegmentRanges(row.blocks, row.aisles, aisleOrder);
    for (const segment of segments) {
      const bands = blockBands.slice(segment.from, segment.to + 1);
      packSlotsAcrossBands(
        segment.slots,
        bands,
        totalWeight,
        pinForSegment(segment.from, segment.to, blockCount),
      ).forEach((placement) => {
        placements.push(placement);
      });
      if (segment.aisleAfter) {
        const aisle = aisles.find((item) => item.id === segment.aisleAfter);
        if (aisle) {
          placements.push({ slot: { kind: "aisle", id: segment.aisleAfter }, t: aisle.t });
        }
      }
    }
    return placements;
  });

  return { totalWeight, aisles, rows: alignedRows };
}
