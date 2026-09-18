import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";

export async function GET() {
  try {
    await requirePermission("maps:read");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    await requirePermission("venues:delete");
    return NextResponse.json({ ok: true, reset: true });
  } catch (error) {
    return jsonError(error);
  }
}
