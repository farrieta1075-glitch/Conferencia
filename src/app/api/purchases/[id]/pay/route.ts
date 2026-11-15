import { NextResponse } from "next/server";
import { HttpError, jsonError, requirePermission } from "@/lib/auth/api";
import { resolveWorkingCampus } from "@/lib/campus";
import { recordPurchasePayment } from "@/lib/sheets/recordPayment";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function paymentMethod(value: unknown): PaymentMethod | undefined {
  if (value === "card" || value === "cash" || value === "other") return value;
  return undefined;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { session } = await requirePermission("payments:complete");
    const { id } = await context.params;
    const body = (await request.json()) as {
      amount?: number;
      settleAll?: boolean;
      method?: PaymentMethod;
      campus?: string;
    };
    if (!id) return NextResponse.json({ error: "Falta el folio" }, { status: 400 });
    if (!body.settleAll && !(Number(body.amount) > 0)) {
      return NextResponse.json({ error: "Indica un monto o liquida el saldo" }, { status: 400 });
    }
    const campus = resolveWorkingCampus(session.user.campus, body.campus);
    try {
      const purchase = await recordPurchasePayment({
        campus,
        id,
        amount: Number(body.amount) || 0,
        settleAll: Boolean(body.settleAll),
        method: paymentMethod(body.method),
      });
      return NextResponse.json({ ok: true, purchase });
    } catch (error) {
      if (error instanceof Error && error.message === "Compra no encontrada") {
        throw new HttpError(404, error.message);
      }
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
