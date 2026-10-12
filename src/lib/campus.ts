export const CAMPUSES = [
  "ALL",
  "MML",
  "CDMX",
  "GDL",
  "TLC",
  "QRO",
  "BJX",
  "CUU",
  "PUE",
  "ACA",
] as const;

export type Campus = (typeof CAMPUSES)[number];
export type DataCampus = Exclude<Campus, "ALL">;

export const DEFAULT_CAMPUS: DataCampus = "QRO";

const CAMPUS_SET = new Set<string>(CAMPUSES);

export function isCampus(value: unknown): value is Campus {
  return typeof value === "string" && CAMPUS_SET.has(value.trim().toUpperCase());
}

export function parseCampus(value: unknown): Campus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return isCampus(normalized) ? normalized : null;
}

export function dataCampusOf(value: unknown): DataCampus {
  const parsed = parseCampus(value);
  if (!parsed || parsed === "ALL") return DEFAULT_CAMPUS;
  return parsed;
}

export function campusLabel(campus: Campus): string {
  if (campus === "ALL") return "Todos los campus";
  return campus;
}

export function canAccessCampus(userCampus: Campus | undefined | null, target: DataCampus): boolean {
  if (!userCampus) return false;
  return userCampus === "ALL" || userCampus === target;
}

export function resolveWorkingCampus(
  userCampus: Campus | undefined | null,
  requested?: string | null,
): DataCampus {
  if (userCampus && userCampus !== "ALL") return userCampus;
  return dataCampusOf(requested);
}
