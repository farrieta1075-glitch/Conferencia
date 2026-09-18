import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import type { EventConfig } from "@/lib/types";

export async function PATCH(request: Request) {
  try {
    await requirePermission("event:edit");
    const event = (await request.json()) as EventConfig;
    if (!event?.name || !event.datetime) {
      return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
