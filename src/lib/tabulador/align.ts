import type { RowSpec, SeatSlot } from "../types";
import { rowSlots } from "./seats";

const SEAT_WEIGHT = 1;
const AISLE_WEIGHT = 2.8;

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

function justifiedTs(
  count: number,
  bandStart: number,
  bandEnd: number,
  totalWeight: number,
  pin: "start" | "end" | "center",
): number[] {
  if (count <= 0) return [];
  const first = bandStart + SEAT_WEIGHT / 2;
  const last = bandEnd - SEAT_WEIGHT / 2;
  if (count === 1) {
    if (pin === "start") return [first / totalWeight];
    if (pin === "end") return [last / totalWeight];
    return [(first + last) / 2 / totalWeight];
  }
  const span = last - first;
  return Array.from({ length: count }, (_, i) => (first + (span * i) / (count - 1)) / totalWeight);
}

function pinForBlock(index: number, blockCount: number): "start" | "end" | "center" {
  if (blockCount <= 1) return "center";
  if (index === 0) return "end";
  if (index === blockCount - 1) return "start";
  return "center";
}

export function buildSectionAlignLayout(rows: RowSpec[]): SectionAlignLayout {
  const split = rows.map((row) => splitByAisles(rowSlots(row)));
  const aisleOrder = globalAisleOrder(split);
  const blockCount = aisleOrder.length + 1;
  const maxCounts = blockMaxCounts(split, aisleOrder);
  const mapped = split.map((row) =>
    mapRowToGlobalBlocks(row.blocks, row.aisles, aisleOrder, maxCounts),
  );

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

  const alignedRows = mapped.map((blocks, rowIndex) => {
    const placements: AlignedSlot[] = [];
    const rowAisles = new Set(split[rowIndex].aisles);
    for (let i = 0; i < blockCount; i += 1) {
      const items = blocks[i] ?? [];
      const band = blockBands[i];
      const ts = justifiedTs(
        items.length,
        band.start,
        band.end,
        totalWeight,
        pinForBlock(i, blockCount),
      );
      items.forEach((slot, j) => {
        placements.push({ slot, t: ts[j] ?? 0.5 });
      });
      const aisleId = aisleOrder[i];
      if (aisleId && rowAisles.has(aisleId)) {
        const aisle = aisles.find((item) => item.id === aisleId);
        if (aisle) {
          placements.push({ slot: { kind: "aisle", id: aisleId }, t: aisle.t });
        }
      }
    }
    return placements;
  });

  return { totalWeight, aisles, rows: alignedRows };
}
