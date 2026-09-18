import type { AreaId, AreaSpec, RowSpec, SeatSlot, SectionSpec, VenueTabulador } from "../types";
import { AREA_ORDER } from "../constants";
import { canonicalizeSectionId } from "./ids";
import { mergeRowSpecs, seatsFromSlots, sortedRows } from "./seats";

const AREA_IDS = new Set<AreaId>(AREA_ORDER);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Campo inválido: ${field}`);
  }
  return value.trim();
}

function asNumberArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item))) {
    throw new Error(`El campo ${field} debe ser un arreglo de enteros`);
  }
  const unique = [...new Set(value as number[])];
  if (unique.length !== value.length) {
    throw new Error(`El campo ${field} contiene asientos duplicados`);
  }
  return unique;
}

function parseSlots(value: unknown, field: string): SeatSlot[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`El campo ${field} debe ser un arreglo de huecos/asientos`);
  }
  return value.map((item, index) => parseSlot(item, `${field}[${index}]`));
}

function parseSlot(value: unknown, field: string): SeatSlot {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new Error(`${field} inválido`);
  }
  if (value.kind === "seat") {
    if (!Number.isInteger(value.number)) {
      throw new Error(`${field}.number debe ser entero`);
    }
    return { kind: "seat", number: value.number as number };
  }
  if (value.kind === "aisle") {
    if (value.id !== "P1" && value.id !== "P2") {
      throw new Error(`${field}.id debe ser P1 o P2`);
    }
    return { kind: "aisle", id: value.id };
  }
  if (value.kind === "clear") return { kind: "clear" };
  if (value.kind === "empty") return { kind: "empty" };
  throw new Error(`${field}.kind desconocido`);
}

export function parseTabulador(input: unknown): VenueTabulador {
  if (!isRecord(input)) throw new Error("El JSON debe ser un objeto");

  const areasRaw = input.areas;
  if (!Array.isArray(areasRaw) || areasRaw.length === 0) {
    throw new Error("El tabulador debe incluir al menos un área");
  }

  const seenSections = new Map<string, { areaIndex: number; section: SectionSpec }>();
  const areas: AreaSpec[] = areasRaw.map((areaRaw, areaIndex) => {
    if (!isRecord(areaRaw)) throw new Error(`Área ${areaIndex} inválida`);
    const id = asString(areaRaw.id, `areas[${areaIndex}].id`) as AreaId;
    if (!AREA_IDS.has(id)) {
      throw new Error(`Área desconocida "${id}". Usa: ${AREA_ORDER.join(", ")}`);
    }
    const sectionsRaw = areaRaw.sections;
    if (!Array.isArray(sectionsRaw) || sectionsRaw.length === 0) {
      throw new Error(`El área ${id} no tiene secciones`);
    }
    const sections: SectionSpec[] = [];
    for (const [sectionIndex, sectionRaw] of sectionsRaw.entries()) {
      if (!isRecord(sectionRaw)) {
        throw new Error(`Sección inválida en ${id}[${sectionIndex}]`);
      }
      const sectionId = canonicalizeSectionId(
        asString(sectionRaw.id, `${id}.sections[${sectionIndex}].id`),
      );
      if (sectionId === "1" || sectionId === "2") continue;
      const rowsRaw = sectionRaw.rows;
      if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
        throw new Error(`La sección ${sectionId} no tiene filas`);
      }
      const rows = sortedRows(rowsRaw.map((rowRaw, rowIndex) => {
        if (!isRecord(rowRaw)) {
          throw new Error(`Fila inválida en ${sectionId}[${rowIndex}]`);
        }
        const rowId = asString(rowRaw.id, `${sectionId}.rows[${rowIndex}].id`);
        const slots = parseSlots(rowRaw.slots, `${sectionId} fila ${rowId}.slots`);
        const seats = rowRaw.seats !== undefined
          ? asNumberArray(rowRaw.seats, `${sectionId} fila ${rowId}.seats`)
          : seatsFromSlots(slots ?? []);
        if (!seats.length) {
          throw new Error(`La fila ${rowId} de ${sectionId} no tiene asientos`);
        }
        const accessibleSeats = rowRaw.accessibleSeats
          ? asNumberArray(rowRaw.accessibleSeats, `${sectionId} fila ${rowId}.accessibleSeats`)
          : undefined;
        if (accessibleSeats?.some((seat) => !seats.includes(seat))) {
          throw new Error(
            `Asientos accesibles de ${sectionId} fila ${rowId} no existen en la fila`,
          );
        }
        const order =
          typeof rowRaw.order === "number" && Number.isFinite(rowRaw.order)
            ? rowRaw.order
            : rowIndex + 1;
        return { id: rowId, order, seats, slots, accessibleSeats } satisfies RowSpec;
      }));
      const existing = seenSections.get(sectionId);
      if (existing) {
        existing.section.rows = mergeRowSpecs([...existing.section.rows, ...rows]);
        continue;
      }
      const section: SectionSpec = {
        id: sectionId,
        name: asString(sectionRaw.name ?? sectionId, `${sectionId}.name`),
        rows,
      };
      seenSections.set(sectionId, { areaIndex, section });
      sections.push(section);
    }
    if (!sections.length) {
      throw new Error(`El área ${id} no tiene secciones`);
    }
    return {
      id,
      name: asString(areaRaw.name, `areas[${areaIndex}].name`),
      colorLabel: asString(areaRaw.colorLabel ?? areaRaw.name, `areas[${areaIndex}].colorLabel`),
      sections,
    };
  });

  return {
    venueName: asString(input.venueName ?? "Auditorio Nacional", "venueName"),
    venueCity: asString(input.venueCity ?? "Ciudad de México", "venueCity"),
    officialCapacity:
      typeof input.officialCapacity === "number" ? input.officialCapacity : areas.length,
    version: typeof input.version === "string" ? input.version : "imported",
    notes: typeof input.notes === "string" ? input.notes : undefined,
    areas,
  };
}

export function tabuladorToPrettyJson(tabulador: VenueTabulador): string {
  return JSON.stringify(tabulador, null, 2);
}
