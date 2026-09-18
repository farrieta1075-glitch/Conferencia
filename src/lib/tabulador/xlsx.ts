import type { AreaId, SeatSlot } from "../types";
import { AREA_LABELS, AREA_ORDER } from "../constants";
import { canonicalizeSectionId } from "./ids";
import { mergeRowSpecs, seatsFromSlots, tokenizeSeatLayout } from "./seats";

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const AREA_KEYS = new Set([
  "area",
  "zona",
  "areaid",
  "idarea",
  "nombrearea",
  "areadelasiento",
]);
const SECTION_KEYS = new Set([
  "section",
  "seccion",
  "seccionid",
  "idseccion",
  "bloque",
  "zonaid",
  "seccionasiento",
]);
const ROW_KEYS = new Set(["row", "fila", "filaid", "idfila", "letter", "letra"]);
const ORDER_KEYS = new Set(["orden", "order", "secuencia", "posicion", "pos"]);
const SEAT_KEYS = new Set([
  "seat",
  "asiento",
  "asientoid",
  "numero",
  "num",
  "butaca",
  "seatnumber",
  "noasiento",
  "numeroasiento",
  "nomenclatura",
]);
const SEATS_LIST_KEYS = new Set(["seats", "asientos", "butacas", "numeros"]);
const ACCESSIBLE_KEYS = new Set([
  "accessible",
  "accesible",
  "silla",
  "sillaruedas",
  "discapacidad",
  "ada",
]);
const VENUE_KEYS = new Set(["venuename", "recinto", "venue", "inmueble", "auditorio"]);
const VERSION_KEYS = new Set(["version", "ver", "revision"]);
const CITY_KEYS = new Set(["venuecity", "ciudad", "city"]);

function headerKind(header: string): string | null {
  const key = normalize(header);
  if (ORDER_KEYS.has(key)) return "order";
  if (AREA_KEYS.has(key)) return "area";
  if (SECTION_KEYS.has(key)) return "section";
  if (ROW_KEYS.has(key)) return "row";
  if (SEATS_LIST_KEYS.has(key)) return "seats";
  if (SEAT_KEYS.has(key)) return "seat";
  if (ACCESSIBLE_KEYS.has(key)) return "accessible";
  if (VENUE_KEYS.has(key)) return "venueName";
  if (VERSION_KEYS.has(key)) return "version";
  if (CITY_KEYS.has(key)) return "venueCity";
  return null;
}

export function inferAreaFromSection(sectionId: string): AreaId {
  const n = Number.parseInt(sectionId, 10);
  if (Number.isFinite(n) && n >= 500) return "segundo-piso";
  if (Number.isFinite(n) && n >= 400) return "primer-piso";
  if (Number.isFinite(n) && n >= 300) return "balcon";
  if (Number.isFinite(n) && n >= 200) return "luneta";
  return "preferente";
}

export function resolveAreaId(raw: string, sectionId: string): AreaId {
  const key = normalize(raw);
  if (key.includes("prefer")) return "preferente";
  if (key.includes("lunet")) return "luneta";
  if (key.includes("balc")) return "balcon";
  if (
    key.includes("primer") ||
    key === "p1" ||
    key.includes("1erpiso") ||
    key.includes("piso1") ||
    key === "1"
  ) {
    return "primer-piso";
  }
  if (
    key.includes("segundo") ||
    key === "p2" ||
    key.includes("2dopiso") ||
    key.includes("piso2") ||
    key === "2"
  ) {
    return "segundo-piso";
  }
  if ((AREA_ORDER as string[]).includes(key)) return key as AreaId;
  return inferAreaFromSection(sectionId);
}

function truthy(value: unknown): boolean {
  const key = normalize(value);
  return ["1", "true", "si", "yes", "x", "ok", "accesible"].includes(key);
}

function compareIds(a: string, b: string): number {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

interface RowChunk {
  areaId: AreaId;
  areaName: string;
  sectionId: string;
  rowId: string;
  order: number;
  slots: SeatSlot[];
  accessible?: boolean;
}

export function groupRowChunks(
  chunks: RowChunk[],
  meta: { venueName?: string; version?: string; venueCity?: string },
): Record<string, unknown> {
  if (!chunks.length) {
    throw new Error("El Excel no contiene asientos con área, sección, fila y número.");
  }

  type RowAcc = { order: number; slots: SeatSlot[]; accessible: number[] };
  const areas = new Map<
    AreaId,
    { name: string; sections: Map<string, Map<string, RowAcc>> }
  >();

  for (const item of chunks) {
    let area = areas.get(item.areaId);
    if (!area) {
      area = { name: item.areaName || AREA_LABELS[item.areaId], sections: new Map() };
      areas.set(item.areaId, area);
    }
    let section = area.sections.get(item.sectionId);
    if (!section) {
      section = new Map();
      area.sections.set(item.sectionId, section);
    }
    let row = section.get(item.rowId);
    if (!row) {
      row = { order: item.order, slots: [], accessible: [] };
      section.set(item.rowId, row);
    }
    row.order = Math.min(row.order, item.order);
    row.slots.push(...item.slots);
    if (item.accessible) {
      for (const slot of item.slots) {
        if (slot.kind === "seat" && !row.accessible.includes(slot.number)) {
          row.accessible.push(slot.number);
        }
      }
    }
  }

  const orderedAreas = AREA_ORDER.filter((id) => areas.has(id)).map((id) => {
    const area = areas.get(id)!;
    const sectionIds = [...area.sections.keys()].sort(compareIds);
    return {
      id,
      name: area.name,
      colorLabel: AREA_LABELS[id],
      sections: sectionIds.map((sectionId) => {
        const rowsMap = area.sections.get(sectionId)!;
        const rows = mergeRowSpecs(
          [...rowsMap.entries()].map(([rowId, row]) => ({
            id: rowId,
            order: row.order,
            seats: seatsFromSlots(row.slots),
            slots: row.slots,
            accessibleSeats: row.accessible.filter((seat) =>
              seatsFromSlots(row.slots).includes(seat),
            ),
          })),
        );
        return {
          id: sectionId,
          name: sectionId,
          rows: rows.map((row) => ({
            id: row.id,
            order: row.order,
            seats: row.seats,
            slots: row.slots,
            ...(row.accessibleSeats?.length ? { accessibleSeats: row.accessibleSeats } : {}),
          })),
        };
      }),
    };
  });

  const seatCount = orderedAreas.reduce(
    (sum, area) =>
      sum +
      area.sections.reduce(
        (sectionSum, section) =>
          sectionSum + section.rows.reduce((rowSum, row) => rowSum + row.seats.length, 0),
        0,
      ),
    0,
  );

  return {
    venueName: meta.venueName?.trim() || "Auditorio Nacional",
    venueCity: meta.venueCity?.trim() || "Ciudad de México",
    officialCapacity: seatCount,
    version: meta.version?.trim() || "imported-xlsx",
    notes:
      "Tabulador importado desde Excel. Orden 1 = fila inferior (hacia el escenario). P1/P2 = pasillos, C = hueco, E = columna vacía.",
    areas: orderedAreas,
  };
}

function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 30);
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i] ?? [];
    const score = row.reduce<number>(
      (sum, cell) => (headerKind(String(cell ?? "")) ? sum + 1 : sum),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (bestScore < 2) {
    throw new Error(
      "No se encontraron columnas de área, sección y fila. Usa encabezados como Orden, Área, Sección, Fila, Asiento.",
    );
  }
  return best;
}

function cell(row: unknown[], index: number | undefined): unknown {
  if (index === undefined) return undefined;
  return row[index];
}

function parseOrder(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function sheetRowsToTabuladorInput(rows: unknown[][]): Record<string, unknown> {
  if (!rows.length) throw new Error("La hoja de Excel está vacía.");
  const headerIndex = findHeaderRow(rows);
  const headers = (rows[headerIndex] ?? []).map((item) => String(item ?? "").trim());
  const kinds = headers.map((header) => headerKind(header));

  const indexOf = (kind: string) => {
    const i = kinds.indexOf(kind);
    return i >= 0 ? i : undefined;
  };

  const areaIdx = indexOf("area");
  const sectionIdx = indexOf("section");
  const rowIdx = indexOf("row");
  const seatIdx = indexOf("seat");
  const seatsIdx = indexOf("seats");
  const orderIdx = indexOf("order");
  const accessibleIdx = indexOf("accessible");
  const venueIdx = indexOf("venueName");
  const versionIdx = indexOf("version");
  const cityIdx = indexOf("venueCity");

  if (sectionIdx === undefined || rowIdx === undefined) {
    throw new Error("El Excel debe incluir columnas de Sección y Fila.");
  }

  const wideSeatCols: { index: number; seat: number }[] = [];
  headers.forEach((header, index) => {
    if (kinds[index]) return;
    const n = Number.parseInt(header, 10);
    if (Number.isInteger(n) && String(n) === normalize(header)) {
      wideSeatCols.push({ index, seat: n });
    }
  });

  const meta = {
    venueName: undefined as string | undefined,
    version: undefined as string | undefined,
    venueCity: undefined as string | undefined,
  };

  for (let i = 0; i < headerIndex; i += 1) {
    const preview = rows[i] ?? [];
    const left = normalize(preview[0]);
    const right = preview[1];
    if (VENUE_KEYS.has(left) && right) meta.venueName = String(right);
    if (VERSION_KEYS.has(left) && right) meta.version = String(right);
    if (CITY_KEYS.has(left) && right) meta.venueCity = String(right);
  }

  const chunks: RowChunk[] = [];

  for (let r = headerIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const sectionId = canonicalizeSectionId(cell(row, sectionIdx));
    const rowId = String(cell(row, rowIdx) ?? "").trim();
    if (!sectionId || !rowId || sectionId === "1" || sectionId === "2") continue;

    const areaRaw = String(cell(row, areaIdx) ?? "");
    const areaId = resolveAreaId(areaRaw, sectionId);
    const areaName = areaRaw.trim() || AREA_LABELS[areaId];
    const accessible = truthy(cell(row, accessibleIdx));
    const order = parseOrder(cell(row, orderIdx), r - headerIndex);

    if (venueIdx !== undefined && cell(row, venueIdx) && !meta.venueName) {
      meta.venueName = String(cell(row, venueIdx));
    }
    if (versionIdx !== undefined && cell(row, versionIdx) && !meta.version) {
      meta.version = String(cell(row, versionIdx));
    }
    if (cityIdx !== undefined && cell(row, cityIdx) && !meta.venueCity) {
      meta.venueCity = String(cell(row, cityIdx));
    }

    const slots: SeatSlot[] = [];
    if (seatsIdx !== undefined) slots.push(...tokenizeSeatLayout(cell(row, seatsIdx)));
    if (seatIdx !== undefined) slots.push(...tokenizeSeatLayout(cell(row, seatIdx)));
    for (const col of wideSeatCols) {
      const value = cell(row, col.index);
      if (value === null || value === undefined || String(value).trim() === "") continue;
      const parsed = tokenizeSeatLayout(value);
      if (parsed.length) slots.push(...parsed);
      else slots.push({ kind: "seat", number: col.seat });
    }

    if (!slots.length) continue;
    chunks.push({
      areaId,
      areaName,
      sectionId,
      rowId,
      order,
      slots,
      accessible,
    });
  }

  return groupRowChunks(chunks, meta);
}

export async function xlsxToTabuladorInput(buffer: ArrayBuffer): Promise<Record<string, unknown>> {
  const XLSX = await import("xlsx");
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  if (!workbook.SheetNames.length) throw new Error("El archivo Excel no contiene hojas.");

  const ranked = [
    ...workbook.SheetNames.filter((name) =>
      /tabulador|asiento|butaca|datos|seats/i.test(name),
    ),
    ...workbook.SheetNames,
  ];
  const seen = new Set<string>();

  for (const name of ranked) {
    if (seen.has(name)) continue;
    seen.add(name);
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    });
    if (!rows.length) continue;
    try {
      return sheetRowsToTabuladorInput(rows);
    } catch (error) {
      if (seen.size === workbook.SheetNames.length) throw error;
    }
  }

  throw new Error("El archivo Excel no contiene filas de tabulador.");
}

export const TABULADOR_XLSX_EXAMPLE = `Orden | Área | Sección | Fila | Asiento
1 | Preferente | 101 | A | 1,2,3, - P1- ,4,5, - C - ,6,7, - P2- ,8,9, - E -
2 | Preferente | 101 | B | 1,2,3, - P1- ,4,5,6

Orden 1 = fila más cercana al escenario (abajo).
- P1- / - P2- = pasillos del área
- C - = hueco sin más asientos
- E - = columna completa vacía`;
