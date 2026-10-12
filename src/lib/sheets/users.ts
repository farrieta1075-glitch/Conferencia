import { parseRole, type Role } from "@/lib/auth/roles";
import { DEFAULT_CAMPUS, parseCampus, type Campus } from "@/lib/campus";
import {
  ensureTabs,
  getSheets,
  getSpreadsheetId,
  sheetsConfigured,
} from "@/lib/sheets/client";

export interface SheetAuthUser {
  email: string;
  name: string;
  role: Role;
  campus: Campus;
  passwordHash?: string;
  source: "env" | "file";
}

const HEADERS = ["correo", "nombre", "rol", "origen", "hash", "campus"] as const;

async function replaceUsersTab(values: string[][]) {
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) throw new Error("Falta GOOGLE_SHEETS_ID");
  await ensureTabs(spreadsheetId);
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Usuarios!A1",
    valueInputOption: "RAW",
    requestBody: { values },
  });
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `Usuarios!A${values.length + 1}:Z`,
  });
}

export async function readUsersFromSheets(): Promise<SheetAuthUser[]> {
  if (!sheetsConfigured()) return [];
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) return [];
  await ensureTabs(spreadsheetId);
  const sheets = getSheets();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Usuarios!A:F",
  });
  const rows = (result.data.values ?? []).slice(1);
  return rows.flatMap((row) => {
    const email = String(row[0] ?? "")
      .trim()
      .toLowerCase();
    const name = String(row[1] ?? "").trim();
    const role = parseRole(row[2]);
    const origin = String(row[3] ?? "")
      .trim()
      .toLowerCase();
    const passwordHash = String(row[4] ?? "").trim();
    const campus = parseCampus(row[5]) ?? (email === "admin@auditorio.local" ? "ALL" : DEFAULT_CAMPUS);
    if (!email || !role || origin === "env" || !passwordHash) return [];
    return [
      {
        email,
        name: name || email,
        role,
        campus,
        passwordHash,
        source: "file" as const,
      },
    ];
  });
}

export async function writeUsersToSheets(users: SheetAuthUser[]): Promise<void> {
  if (!sheetsConfigured()) return;
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) throw new Error("Falta GOOGLE_SHEETS_ID");
  await replaceUsersTab([
    [...HEADERS],
    ...users.map((user) => [
      user.email,
      user.name,
      user.role,
      user.source,
      user.source === "file" ? user.passwordHash ?? "" : "",
      user.campus ?? (user.email === "admin@auditorio.local" ? "ALL" : DEFAULT_CAMPUS),
    ]),
  ]);
}
