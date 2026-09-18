import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import {
  ensureTabs,
  getSpreadsheetId,
  saveSpreadsheetId,
  sheetsConfigured,
} from "@/lib/sheets/client";
import { loadStateFromSheets } from "@/lib/sheets/load";
import { syncStateToSheets } from "@/lib/sheets/sync";
import type { PersistedState } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await requirePermission("maps:read");
    const spreadsheetId = await getSpreadsheetId();
    const hydrate = new URL(request.url).searchParams.get("hydrate") === "1";
    const payload: {
      configured: boolean;
      spreadsheetId: string;
      ready: boolean;
      state?: PersistedState | null;
      hydrateError?: string;
    } = {
      configured: sheetsConfigured(),
      spreadsheetId,
      ready: sheetsConfigured() && Boolean(spreadsheetId),
    };
    if (hydrate) {
      try {
        payload.state = payload.ready ? await loadStateFromSheets() : null;
      } catch (error) {
        payload.state = null;
        payload.hydrateError =
          error instanceof Error ? error.message : "No se pudo leer Google Sheets";
      }
    }
    return NextResponse.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("sheets:sync");
    const body = (await request.json()) as {
      spreadsheetId?: string;
      state?: PersistedState;
    };
    if (body.spreadsheetId?.trim() && !process.env.GOOGLE_SHEETS_ID?.trim()) {
      await saveSpreadsheetId(body.spreadsheetId.trim());
    }
    if (!body.state) {
      const spreadsheetId = await getSpreadsheetId();
      if (spreadsheetId && sheetsConfigured()) {
        await ensureTabs(spreadsheetId);
      }
      return NextResponse.json({
        ok: true,
        spreadsheetId,
        readOnlyId: Boolean(process.env.GOOGLE_SHEETS_ID?.trim() || process.env.VERCEL),
      });
    }
    const result = await syncStateToSheets(body.state);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
