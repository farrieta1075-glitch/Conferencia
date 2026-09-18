import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

function dataFile(name: string) {
  const root = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data");
  return path.join(root, name);
}

const CONFIG_FILE = dataFile("config.json");

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

export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  if (key.includes("BEGIN") && !key.includes("\n") && key.includes(" ")) {
    key = key
      .replace("-----BEGIN PRIVATE KEY----- ", "-----BEGIN PRIVATE KEY-----\n")
      .replace(" -----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----");
    const [header, rest = ""] = key.split("\n");
    const [body, footer] = rest.split("\n-----END");
    key = `${header}\n${(body ?? "").replace(/ /g, "\n")}\n-----END${footer ?? " PRIVATE KEY-----"}`;
  }
  if (!key.endsWith("\n")) key += "\n";
  return key;
}

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
  if (process.env.GOOGLE_SHEETS_ID?.trim()) return;
  if (process.env.VERCEL) return;
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
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY");
  }
  return new google.auth.JWT({
    email,
    key: normalizePrivateKey(rawKey),
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
