import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import { deleteUser } from "@/lib/auth/users";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ email: string }> },
) {
  try {
    await requirePermission("users:manage");
    const { email } = await context.params;
    await deleteUser(decodeURIComponent(email));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
