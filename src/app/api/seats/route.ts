import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import type { AssignPayload } from "@/lib/types";

export async function GET() {
  try {
    await requirePermission("seats:read");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePermission("seats:edit");
    const payload = (await request.json()) as AssignPayload;
    if (!payload?.seatIds?.length) {
      return NextResponse.json({ error: "Sin asientos" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, count: payload.seatIds.length });
  } catch (error) {
    return jsonError(error);
  }
}
