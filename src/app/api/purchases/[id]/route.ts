import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import type { PurchasePatch } from "@/lib/purchases";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("tickets:edit");
    const { id } = await context.params;
    const patch = (await request.json()) as PurchasePatch;
    if (!id) return NextResponse.json({ error: "Falta el folio" }, { status: 400 });
    return NextResponse.json({ ok: true, id, patch });
  } catch (error) {
    return jsonError(error);
  }
}
