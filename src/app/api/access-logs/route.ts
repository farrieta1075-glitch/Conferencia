import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import { isSuperuserEmail, listAccessLogs } from "@/lib/auth/accessLogs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { session } = await requirePermission("users:manage");
    if (!isSuperuserEmail(session.user.email)) {
      return NextResponse.json({ error: "Solo el superusuario puede ver los logs" }, { status: 403 });
    }
    const logs = await listAccessLogs();
    return NextResponse.json({ logs });
  } catch (error) {
    return jsonError(error);
  }
}
