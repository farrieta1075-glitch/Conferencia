import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import type { Promotion } from "@/lib/types";

export async function POST(request: Request) {
  try {
    await requirePermission("prices:edit");
    const promotion = (await request.json()) as Promotion;
    if (!promotion?.id || !promotion.name) {
      return NextResponse.json({ error: "Promoción inválida" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: promotion.id });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermission("prices:edit");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return jsonError(error);
  }
}
