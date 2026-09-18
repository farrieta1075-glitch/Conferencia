import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";

export async function PATCH(request: Request) {
  try {
    await requirePermission("prices:edit");
    const body = (await request.json()) as { areaId?: string; basePrice?: number };
    if (!body.areaId || typeof body.basePrice !== "number") {
      return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
