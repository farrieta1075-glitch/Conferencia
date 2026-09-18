import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import type { VenueTabulador } from "@/lib/types";

export async function POST(request: Request) {
  try {
    await requirePermission("tabulador:import");
    const body = (await request.json()) as { tabulador?: VenueTabulador };
    if (!body.tabulador?.areas?.length) {
      return NextResponse.json({ error: "Tabulador inválido" }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      venueName: body.tabulador.venueName,
      areas: body.tabulador.areas.length,
    });
  } catch (error) {
    return jsonError(error);
  }
}
