import type { RowSpec, SeatSlot } from "../types";

const TOKEN_RE =
  /pasillo\s*2|pasillo\s*1|-\s*P\s*2\s*-?|-\s*P\s*1\s*-?|\bP\s*2\b|\bP\s*1\b|-\s*C\s*-|-\s*E\s*-|\bC\b|\bE\b|(\d+)\s*[-–]\s*(\d+)|(\d+)/gi;

export function tokenizeSeatLayout(value: unknown): SeatSlot[] {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "number" && Number.isInteger(value)) {
    return [{ kind: "seat", number: value }];
  }
  const text = String(value);
  const slots: SeatSlot[] = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    const token = match[0].toUpperCase().replace(/\s+/g, "");
    if (token.includes("PASILLO2") || token.includes("P2")) {
      slots.push({ kind: "aisle", id: "P2" });
      continue;
    }
    if (token.includes("PASILLO1") || token.includes("P1")) {
      slots.push({ kind: "aisle", id: "P1" });
      continue;
    }
    if (token.includes("C") && !/\d/.test(token)) {
      slots.push({ kind: "clear" });
      continue;
    }
    if (token.includes("E") && !/\d/.test(token)) {
      slots.push({ kind: "empty" });
      continue;
    }
    if (match[1] && match[2]) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      const from = Math.min(start, end);
      const to = Math.max(start, end);
      for (let n = from; n <= to; n += 1) slots.push({ kind: "seat", number: n });
      continue;
    }
    if (match[3]) {
      slots.push({ kind: "seat", number: Number(match[3]) });
    }
  }
  return slots;
}

export function seatsFromSlots(slots: SeatSlot[]): number[] {
  const seats: number[] = [];
  for (const slot of slots) {
    if (slot.kind === "seat" && !seats.includes(slot.number)) seats.push(slot.number);
  }
  return seats;
}

export function serializeSeatLayout(slots: SeatSlot[]): string {
  return slots
    .map((slot) => {
      if (slot.kind === "seat") return String(slot.number);
      if (slot.kind === "aisle") return `- ${slot.id}-`;
      if (slot.kind === "clear") return "- C -";
      return "- E -";
    })
    .join(",");
}

export function looksLikeSeatLayout(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/,|p\s*1|p\s*2|pasillo|- *c *-|- *e *-/i.test(text)) return true;
  if (/\b[CE]\b/i.test(text) && !/^\d+$/.test(text)) return true;
  return false;
}

export function rowSlots(row: RowSpec): SeatSlot[] {
  if (row.slots && row.slots.length) return row.slots;
  return row.seats.map((number) => ({ kind: "seat" as const, number }));
}

export function slotWeight(slot: SeatSlot): number {
  switch (slot.kind) {
    case "seat":
      return 1;
    case "aisle":
      return 1.7;
    case "clear":
      return 1.15;
    case "empty":
      return 2.4;
    default:
      return 1;
  }
}

export function rowWeight(row: RowSpec): number {
  return rowSlots(row).reduce((sum, slot) => sum + slotWeight(slot), 0);
}

export function sortedRows(rows: RowSpec[]): RowSpec[] {
  return [...rows].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id, "es", { numeric: true, sensitivity: "base" });
  });
}

export function mergeRowSpecs(rows: RowSpec[]): RowSpec[] {
  const byId = new Map<string, RowSpec>();
  for (const row of rows) {
    const current = byId.get(row.id);
    if (!current) {
      byId.set(row.id, {
        ...row,
        seats: [...row.seats],
        slots: row.slots ? [...row.slots] : undefined,
        accessibleSeats: row.accessibleSeats ? [...row.accessibleSeats] : undefined,
      });
      continue;
    }
    current.order = Math.min(current.order ?? row.order ?? 0, row.order ?? current.order ?? 0);
    current.slots = [...(current.slots ?? rowSlots(current)), ...(row.slots ?? rowSlots(row))];
    current.seats = seatsFromSlots(current.slots);
    const accessible = [...(current.accessibleSeats ?? []), ...(row.accessibleSeats ?? [])];
    current.accessibleSeats = accessible.length ? [...new Set(accessible)] : undefined;
  }
  return sortedRows([...byId.values()]);
}
