import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import { parseRole, type Role } from "@/lib/auth/roles";
import { parseCampus, type Campus } from "@/lib/campus";
import { parseSchedule, type EditorSchedule } from "@/lib/auth/schedule";
import { deleteUser, publicUser, updateUser } from "@/lib/auth/users";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ email: string }> },
) {
  try {
    await requirePermission("users:manage");
    const { email } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      role?: string;
      campus?: string;
      password?: string;
      schedule?: unknown;
    };
    const patch: {
      name?: string;
      role?: Role;
      campus?: Campus;
      password?: string;
      schedule?: EditorSchedule | null;
    } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (body.role !== undefined) {
      const role = parseRole(body.role);
      if (!role) return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
      patch.role = role;
    }
    if (body.campus !== undefined) {
      const campus = parseCampus(body.campus);
      if (!campus) return NextResponse.json({ error: "Campus inválido" }, { status: 400 });
      patch.campus = campus;
    }
    if (typeof body.password === "string") patch.password = body.password;
    if ("schedule" in body) {
      if (body.schedule === null) patch.schedule = null;
      else {
        const schedule = parseSchedule(body.schedule);
        if (!schedule) return NextResponse.json({ error: "Horario inválido" }, { status: 400 });
        patch.schedule = schedule;
      }
    }
    const user = await updateUser(decodeURIComponent(email), patch);
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
