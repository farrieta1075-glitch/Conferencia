import type {
  AreaId,
  AreaSpec,
  RowSpec,
  SeatRef,
  SeatSlot,
  SectionSpec,
  VenueTabulador,
} from "../types";
import { seatId } from "../format";
import { canonicalizeSectionId } from "./ids";

function letters(from: string, to: string): string[] {
  const rows: string[] = [];
  for (let c = from.charCodeAt(0); c <= to.charCodeAt(0); c += 1) {
    rows.push(String.fromCharCode(c));
  }
  return rows;
}

function seq(count: number, start = 1): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

function odds(count: number, start = 1): number[] {
  return Array.from({ length: count }, (_, i) => start + i * 2);
}

function evens(count: number, start = 2): number[] {
  return Array.from({ length: count }, (_, i) => start + i * 2);
}

function asSeats(numbers: number[]): SeatSlot[] {
  return numbers.map((number) => ({ kind: "seat" as const, number }));
}

type Numbering = "seq" | "odd" | "even" | "center-aisle" | "two-aisle";

function growingRows(
  from: string,
  to: string,
  startCount: number,
  growth: number,
  numbering: Numbering,
  accessibleRow?: string,
  accessibleCount = 2,
): RowSpec[] {
  return letters(from, to).map((id, index) => {
    const count = Math.max(4, Math.round(startCount + index * growth));
    let seats: number[];
    let slots: SeatSlot[];
    if (numbering === "odd") {
      seats = odds(count);
      slots = asSeats(seats);
    } else if (numbering === "even") {
      seats = evens(count);
      slots = asSeats(seats);
    } else if (numbering === "center-aisle") {
      const leftCount = Math.floor(count / 2);
      const rightCount = count - leftCount;
      const left = seq(leftCount, 1);
      const right = seq(rightCount, leftCount + 1);
      seats = [...left, ...right];
      slots = [...asSeats(left), { kind: "aisle", id: "P1" }, ...asSeats(right)];
    } else if (numbering === "two-aisle") {
      const leftCount = Math.floor(count / 3);
      const midCount = Math.floor(count / 3);
      const rightCount = count - leftCount - midCount;
      const left = seq(leftCount, 1);
      const mid = seq(midCount, leftCount + 1);
      const right = seq(rightCount, leftCount + midCount + 1);
      seats = [...left, ...mid, ...right];
      slots = [
        ...asSeats(left),
        { kind: "aisle", id: "P1" },
        ...asSeats(mid),
        { kind: "aisle", id: "P2" },
        ...asSeats(right),
      ];
    } else {
      seats = seq(count);
      slots = asSeats(seats);
    }
    const row: RowSpec = { id, order: index + 1, seats, slots };
    if (accessibleRow && id === accessibleRow) {
      row.accessibleSeats = seats.slice(0, accessibleCount);
    }
    return row;
  });
}

function section(id: string, rows: RowSpec[]): SectionSpec {
  return { id, name: id, rows };
}

function area(
  id: AreaId,
  name: string,
  colorLabel: string,
  sections: SectionSpec[],
): AreaSpec {
  return { id, name, colorLabel, sections };
}

export function buildDefaultTabulador(): VenueTabulador {
  const preferente = area("preferente", "Preferente", "Platea baja", [
    section("101", growingRows("A", "H", 8, 0.4, "seq")),
    section("102", growingRows("A", "I", 9, 0.4, "odd")),
    section("103", growingRows("A", "I", 9, 0.4, "even")),
    section("104", growingRows("A", "N", 16, 0.55, "center-aisle")),
    section("105", growingRows("A", "N", 12, 0.45, "odd")),
    section("106", growingRows("A", "N", 12, 0.45, "even")),
    section("107", growingRows("A", "P", 18, 0.55, "center-aisle")),
    section("108", growingRows("A", "O", 12, 0.4, "odd")),
    section("109", growingRows("A", "O", 12, 0.4, "even")),
  ]);

  const luneta = area("luneta", "Luneta", "Platea media", [
    section("201", growingRows("A", "P", 14, 0.4, "center-aisle", "L")),
    section("202", growingRows("A", "P", 12, 0.4, "odd", "L")),
    section("203", growingRows("A", "P", 12, 0.4, "even", "L")),
    section("204", growingRows("A", "P", 16, 0.45, "seq", "L")),
    section("205", growingRows("A", "P", 16, 0.45, "seq", "L")),
    section("206", growingRows("A", "R", 14, 0.4, "odd", "L")),
    section("207", growingRows("A", "R", 14, 0.4, "even", "L")),
  ]);

  const balcon = area("balcon", "Balcón", "Mezzanine", [
    section("301", growingRows("A", "P", 14, 0.35, "odd", "Q")),
    section("302", growingRows("A", "P", 14, 0.35, "even", "Q")),
    section("303", growingRows("A", "N", 12, 0.35, "seq", "Q")),
    section("304", growingRows("A", "N", 12, 0.35, "seq", "Q")),
    section("305", growingRows("A", "P", 13, 0.35, "odd", "Q")),
    section("306", growingRows("A", "P", 13, 0.35, "even", "Q")),
  ]);

  const primerPiso = area("primer-piso", "Primer piso", "Primer nivel", [
    section("401", growingRows("A", "P", 18, 0.45, "two-aisle", "A", 4)),
    section("402", growingRows("A", "N", 14, 0.4, "seq", "A", 2)),
    section("403", growingRows("A", "N", 14, 0.4, "seq", "A", 2)),
    section("404", growingRows("A", "N", 13, 0.35, "odd", "A", 2)),
    section("405", growingRows("A", "N", 13, 0.35, "even", "A", 2)),
    section("406", growingRows("A", "O", 13, 0.35, "seq", "A", 4)),
    section("407", growingRows("A", "O", 13, 0.35, "seq", "A", 4)),
  ]);

  const segundoPiso = area("segundo-piso", "Segundo piso", "Segundo nivel", [
    section("501", growingRows("A", "P", 20, 0.45, "center-aisle")),
    section("502", growingRows("A", "N", 16, 0.4, "seq")),
    section("503", growingRows("A", "N", 16, 0.4, "seq")),
    section("504", growingRows("A", "M", 13, 0.35, "seq")),
    section("505", growingRows("A", "M", 13, 0.35, "seq")),
    section("506", growingRows("A", "L", 12, 0.3, "odd")),
    section("507", growingRows("A", "L", 12, 0.3, "even")),
  ]);

  return {
    venueName: "Auditorio Nacional",
    venueCity: "Ciudad de México",
    officialCapacity: 9564,
    version: "2.0.0",
    notes:
      "Distribución alineada al plano General.png del Auditorio Nacional (101 al centro, bloques unificados 204/301/401/501). Reemplázalo importando JSON o Excel.",
    areas: [preferente, luneta, balcon, primerPiso, segundoPiso],
  };
}

export function flattenSeats(tabulador: VenueTabulador): SeatRef[] {
  const seats: SeatRef[] = [];
  for (const areaItem of tabulador.areas) {
    for (const sectionItem of areaItem.sections) {
      for (const row of sectionItem.rows) {
        const accessible = new Set(row.accessibleSeats ?? []);
        for (const number of row.seats) {
          seats.push({
            id: seatId(sectionItem.id, row.id, number),
            areaId: areaItem.id,
            areaName: areaItem.name,
            sectionId: sectionItem.id,
            sectionName: sectionItem.name,
            rowId: row.id,
            number,
            accessible: accessible.has(number),
          });
        }
      }
    }
  }
  return seats;
}

export function indexSeats(tabulador: VenueTabulador): Map<string, SeatRef> {
  return new Map(flattenSeats(tabulador).map((seat) => [seat.id, seat]));
}

export function findSection(tabulador: VenueTabulador, sectionId: string) {
  const wanted = canonicalizeSectionId(sectionId);
  for (const areaItem of tabulador.areas) {
    const sectionItem = areaItem.sections.find(
      (item) => item.id === sectionId || canonicalizeSectionId(item.id) === wanted,
    );
    if (sectionItem) return { area: areaItem, section: sectionItem };
  }
  return null;
}

export function countTabuladorSeats(tabulador: VenueTabulador): number {
  return tabulador.areas.reduce(
    (areaTotal, areaItem) =>
      areaTotal +
      areaItem.sections.reduce(
        (sectionTotal, sectionItem) =>
          sectionTotal +
          sectionItem.rows.reduce((rowTotal, row) => rowTotal + row.seats.length, 0),
        0,
      ),
    0,
  );
}

export const TABULADOR_JSON_EXAMPLE = `{
  "venueName": "Auditorio Nacional",
  "venueCity": "Ciudad de México",
  "officialCapacity": 9564,
  "version": "1.0.0",
  "areas": [
    {
      "id": "preferente",
      "name": "Preferente",
      "colorLabel": "Platea baja",
      "sections": [
        {
          "id": "105",
          "name": "105",
          "rows": [
            { "id": "A", "order": 1, "seats": [1, 2, 3, 4, 5, 8, 9, 10, 11, 12], "slots": [
              { "kind": "seat", "number": 1 }, { "kind": "seat", "number": 2 },
              { "kind": "aisle", "id": "P1" }, { "kind": "seat", "number": 3 },
              { "kind": "clear" }, { "kind": "seat", "number": 4 }
            ]},
            { "id": "B", "order": 2, "seats": [1, 3, 5, 7, 9, 11] }
          ]
        }
      ]
    }
  ]
}`;
