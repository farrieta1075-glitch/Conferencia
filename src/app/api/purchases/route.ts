import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import type { Purchase } from "@/lib/types";

export async function GET() {
  try {
    await requirePermission("tickets:read");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("sales:create");
    const purchase = (await request.json()) as Purchase;
    if (!purchase?.id || !purchase.tickets?.length) {
      return NextResponse.json({ error: "Compra inválida" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: purchase.id });
  } catch (error) {
    return jsonError(error);
  }
}
