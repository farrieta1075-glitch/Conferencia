import { ensureTabs, getSheets, getSpreadsheetId, sheetsConfigured } from "@/lib/sheets/client";

export const SUPERUSER_EMAIL = "admin@auditorio.local";

export interface AccessLogEntry {
  at: string;
  email: string;
  name: string;
  role: string;
  campus: string;
  result: "ok" | "credenciales" | "horario";
  ip: string;
}

const HEADERS = ["fecha", "correo", "nombre", "rol", "campus", "resultado", "ip"] as const;
const MAX_ROWS = 400;

export function isSuperuserEmail(email: string | null | undefined): boolean {
  return String(email ?? "")
    .trim()
    .toLowerCase() === SUPERUSER_EMAIL;
}

export async function appendAccessLog(entry: AccessLogEntry): Promise<void> {
  if (!sheetsConfigured()) return;
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) return;
  await ensureTabs(spreadsheetId);
  const sheets = getSheets();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Accesos!A:G",
  });
  const existing = (result.data.values ?? []).slice(1);
  const next = [
    [entry.at, entry.email, entry.name, entry.role, entry.campus, entry.result, entry.ip],
    ...existing,
  ].slice(0, MAX_ROWS);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Accesos!A1",
    valueInputOption: "RAW",
    requestBody: { values: [[...HEADERS], ...next] },
  });
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `Accesos!A${next.length + 2}:G`,
  });
}

export async function listAccessLogs(): Promise<AccessLogEntry[]> {
  if (!sheetsConfigured()) return [];
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) return [];
  await ensureTabs(spreadsheetId);
  const sheets = getSheets();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Accesos!A:G",
  });
  return (result.data.values ?? []).slice(1).flatMap((row) => {
    const at = String(row[0] ?? "").trim();
    const email = String(row[1] ?? "").trim();
    if (!at && !email) return [];
    const resultValue = String(row[5] ?? "").trim();
    const parsed: AccessLogEntry["result"] =
      resultValue === "horario" || resultValue === "credenciales" ? resultValue : "ok";
    return [
      {
        at,
        email,
        name: String(row[2] ?? "").trim(),
        role: String(row[3] ?? "").trim(),
        campus: String(row[4] ?? "").trim(),
        result: parsed,
        ip: String(row[6] ?? "").trim(),
      },
    ];
  });
}
