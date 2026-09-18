import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("payments:complete");
    const { id } = await context.params;
    const body = (await request.json()) as { amount?: number; settleAll?: boolean };
    if (!id) return NextResponse.json({ error: "Falta el folio" }, { status: 400 });
    if (!body.settleAll && !(Number(body.amount) > 0)) {
      return NextResponse.json({ error: "Indica un monto o liquida el saldo" }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      id,
      amount: Number(body.amount) || 0,
      settleAll: Boolean(body.settleAll),
    });
  } catch (error) {
    return jsonError(error);
  }
}
