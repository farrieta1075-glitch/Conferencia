import type { AreaId } from "./types";

export const STORAGE_KEY = "auditorio-nacional-boletos-v7";

export const COLORS = {
  navy: "#0B132B",
  navyMid: "#1C2541",
  navyDeep: "#060B18",
  saleZone: "#071833",
  saleZoneActive: "#0A2A5C",
  white: "#FFFFFF",
  surface: "#F8FAFC",
  ink: "#0F172A",
  inkMuted: "#334155",
  bronze: "#9A6B43",
  bronzeDark: "#8C5A32",
  available: "#16A34A",
  held: "#D97706",
  sold: "#DC2626",
  unassigned: "#CBD5E1",
} as const;

export const AREA_ORDER: AreaId[] = [
  "preferente",
  "luneta",
  "balcon",
  "primer-piso",
  "segundo-piso",
];

export const AREA_LABELS: Record<AreaId, string> = {
  preferente: "Preferente",
  luneta: "Luneta",
  balcon: "Balcón",
  "primer-piso": "Primer piso",
  "segundo-piso": "Segundo piso",
};

export const DEFAULT_PRICES: Record<AreaId, number> = {
  preferente: 2500,
  luneta: 1800,
  balcon: 1200,
  "primer-piso": 900,
  "segundo-piso": 600,
};

export const MAP = {
  width: 1400,
  height: 1120,
  originX: 700,
  originY: 1040,
  viewX: 20,
  viewY: 220,
  viewW: 1360,
  viewH: 900,
} as const;
