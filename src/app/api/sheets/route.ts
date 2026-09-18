import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import {
  getSpreadsheetId,
  saveSpreadsheetId,
  sheetsConfigured,
} from "@/lib/sheets/client";
import { syncStateToSheets } from "@/lib/sheets/sync";
import type { PersistedState } from "@/lib/types";

export async function GET() {
  try {
    await requirePermission("maps:read");
    const spreadsheetId = await getSpreadsheetId();
    return NextResponse.json({
      configured: sheetsConfigured(),
      spreadsheetId,
      ready: sheetsConfigured() && Boolean(spreadsheetId),
    });
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
    if (body.spreadsheetId?.trim()) {
      await saveSpreadsheetId(body.spreadsheetId.trim());
    }
    if (!body.state) {
      return NextResponse.json({
        ok: true,
        spreadsheetId: await getSpreadsheetId(),
      });
    }
    const result = await syncStateToSheets(body.state);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
