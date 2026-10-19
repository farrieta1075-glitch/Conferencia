import { NextResponse } from "next/server";
import { jsonError, requireSuperuser } from "@/lib/auth/api";
import { updateQroSheetPayments } from "@/lib/sheets/qroSheet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    await requireSuperuser();
    const result = await updateQroSheetPayments();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
