import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import { resolveWorkingCampus } from "@/lib/campus";
import {
  ensureTabs,
  getSpreadsheetId,
  saveSpreadsheetId,
  sheetsConfigured,
} from "@/lib/sheets/client";
import { loadStateFromSheets } from "@/lib/sheets/load";
import { applySheetsDelta, syncStateToSheets, type SheetsDelta } from "@/lib/sheets/sync";
import type { PersistedState } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { session } = await requirePermission("maps:read");
    const spreadsheetId = await getSpreadsheetId();
    const url = new URL(request.url);
    const hydrate = url.searchParams.get("hydrate") === "1";
    const campus = resolveWorkingCampus(session.user.campus, url.searchParams.get("campus"));
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
        payload.state = payload.ready ? await loadStateFromSheets(campus) : null;
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
    const { session } = await requirePermission("sheets:sync");
    const body = (await request.json()) as {
      spreadsheetId?: string;
      state?: PersistedState;
      delta?: SheetsDelta;
      writeTabulador?: boolean;
    };
    const campus = resolveWorkingCampus(session.user.campus, body.delta?.campus);
    if (body.spreadsheetId?.trim() && !process.env.GOOGLE_SHEETS_ID?.trim()) {
      await saveSpreadsheetId(body.spreadsheetId.trim());
    }
    if (!body.state && !body.delta) {
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
    const result = body.delta
      ? await applySheetsDelta({ ...body.delta, campus })
      : await syncStateToSheets(body.state as PersistedState, {
          writeTabulador: Boolean(body.writeTabulador),
          campus,
        });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
