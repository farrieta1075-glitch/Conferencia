import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const CONFIG_FILE = path.join(process.cwd(), "data", "config.json");

export const SHEET_TABS = [
  "Evento",
  "Tabulador",
  "Disponibilidad",
  "Precios",
  "Promociones",
  "Ventas",
  "Boletos",
  "Parcialidades",
  "Usuarios",
] as const;

export async function getSpreadsheetId(): Promise<string> {
  const fromEnv = process.env.GOOGLE_SHEETS_ID?.trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as { spreadsheetId?: string };
    return parsed.spreadsheetId?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function saveSpreadsheetId(spreadsheetId: string) {
  await mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify({ spreadsheetId }, null, 2), "utf8");
}

export function sheetsConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY,
  );
}

export function getGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY en .env.local");
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export function getSheets() {
  return google.sheets({ version: "v4", auth: getGoogleAuth() });
}

export async function ensureTabs(spreadsheetId: string) {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = new Set((meta.data.sheets ?? []).map((sheet) => sheet.properties?.title));
  const requests = SHEET_TABS.filter((title) => !existing.has(title)).map((title) => ({
    addSheet: { properties: { title } },
  }));
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }
}
