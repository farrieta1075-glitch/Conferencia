import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import { parseSchedule } from "@/lib/auth/schedule";
import { deleteUser, publicUser, updateUserSchedule } from "@/lib/auth/users";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ email: string }> },
) {
  try {
    await requirePermission("users:manage");
    const { email } = await context.params;
    const body = (await request.json()) as { schedule?: unknown };
    const schedule = body.schedule === null ? undefined : parseSchedule(body.schedule);
    if (body.schedule !== null && body.schedule !== undefined && !schedule) {
      return NextResponse.json({ error: "Horario inválido" }, { status: 400 });
    }
    const user = await updateUserSchedule(decodeURIComponent(email), schedule);
    return NextResponse.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}

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
