import { DEFAULT_CAMPUS, dataCampusOf, type DataCampus } from "@/lib/campus";
import { getSheets } from "@/lib/sheets/client";

export function rowCampus(row: string[], campusIndex: number): DataCampus {
  return dataCampusOf(row[campusIndex]);
}

export function filterCampusRows(
  rows: string[][],
  campusIndex: number,
  campus: DataCampus | "ALL",
): string[][] {
  if (!rows.length) return rows;
  const header = rows[0];
  const data = rows.slice(1);
  if (campus === "ALL") return rows;
  return [header, ...data.filter((row) => rowCampus(row, campusIndex) === campus)];
}

export async function readTab(spreadsheetId: string, range: string): Promise<string[][]> {
  const sheets = getSheets();
  const result = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (result.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "").trim()));
}

export function keepOtherCampusRows(
  existing: string[][],
  campusIndex: number,
  campus: DataCampus,
): string[][] {
  return existing.slice(1).filter((row) => row.some(Boolean) && rowCampus(row, campusIndex) !== campus);
}

export function withCampus(row: (string | number)[], campus: DataCampus): string[] {
  return [...row.map((cell) => String(cell ?? "")), campus];
}
