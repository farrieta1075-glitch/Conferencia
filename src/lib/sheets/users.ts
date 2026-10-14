import { parseRole, type Role } from "@/lib/auth/roles";
import { parseSchedule, type EditorSchedule } from "@/lib/auth/schedule";
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
  schedule?: EditorSchedule;
}

const HEADERS = [
  "correo",
  "nombre",
  "rol",
  "origen",
  "hash",
  "campus",
  "horario_tipo",
  "horario_dias",
  "horario_inicio",
  "horario_fin",
  "horario_fecha",
] as const;

function serializeSchedule(schedule?: EditorSchedule) {
  if (!schedule) return ["", "", "", "", ""];
  if (schedule.mode === "once") {
    return [schedule.mode, "", schedule.start ?? "", schedule.end ?? "", schedule.date ?? ""];
  }
  const encoded = (schedule.windows?.length
    ? schedule.windows
    : (schedule.days ?? []).map((day) => ({
        day,
        start: schedule.start ?? "",
        end: schedule.end ?? "",
      }))
  )
    .map((window) => `${window.day}@${window.start}-${window.end}`)
    .join("|");
  return [schedule.mode, encoded, "", "", ""];
}

function parseEncodedWindows(raw: string): { day: number; start?: string; end?: string }[] {
  return raw
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      const match = item.match(/^(\d)(?:@(\d{1,2}:\d{2})-(\d{1,2}:\d{2}))?$/);
      if (!match) return [];
      const day = Number(match[1]);
      if (!match[2] || !match[3]) return [{ day }];
      return [{ day, start: match[2], end: match[3] }];
    });
}

function parseRowSchedule(row: string[]): EditorSchedule | undefined {
  const encoded = parseEncodedWindows(String(row[7] ?? ""));
  const windows = encoded.flatMap((item) =>
    item.start && item.end ? [{ day: item.day, start: item.start, end: item.end }] : [],
  );
  const days = encoded.map((item) => item.day);
  return parseSchedule({
    mode: row[6],
    windows: windows.length ? windows : undefined,
    days,
    start: row[8],
    end: row[9],
    date: row[10],
  });
}

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
    range: "Usuarios!A:K",
  });
  const rows = (result.data.values ?? []).slice(1);
  return rows.flatMap((row) => {
    const cells = row.map((cell) => String(cell ?? "").trim());
    const email = cells[0]?.toLowerCase() ?? "";
    const name = cells[1] ?? "";
    const role = parseRole(cells[2]);
    const origin = (cells[3] ?? "").toLowerCase();
    const passwordHash = cells[4] ?? "";
    const campus = parseCampus(cells[5]) ?? (email === "admin@auditorio.local" ? "ALL" : DEFAULT_CAMPUS);
    if (!email || !role) return [];
    if (origin !== "env" && !passwordHash) return [];
    return [
      {
        email,
        name: name || email,
        role,
        campus,
        passwordHash: origin === "env" ? undefined : passwordHash,
        source: origin === "env" ? ("env" as const) : ("file" as const),
        schedule: parseRowSchedule(cells),
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
      ...serializeSchedule(user.schedule),
    ]),
  ]);
}
