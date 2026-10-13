import { ensureTabs, getSheets, getSpreadsheetId, sheetsConfigured } from "@/lib/sheets/client";

export async function readEventLogoDataUrl(): Promise<string | undefined> {
  if (!sheetsConfigured()) return undefined;
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) return undefined;
  try {
    await ensureTabs(spreadsheetId);
    const sheets = getSheets();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Logo!A1:Z",
    });
    const rows = (result.data.values ?? []).map((row) =>
      row.map((cell) => String(cell ?? "").trim()),
    );
    const data = (rows[1] ?? []).join("");
    return data.startsWith("data:image") ? data : undefined;
  } catch {
    return undefined;
  }
}
