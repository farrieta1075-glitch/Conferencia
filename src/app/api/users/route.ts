import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import { createUser, listUsers, publicUser } from "@/lib/auth/users";
import { parseRole } from "@/lib/auth/roles";

export async function GET() {
  try {
    await requirePermission("users:manage");
    const users = await listUsers();
    return NextResponse.json({ users: users.map(publicUser) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("users:manage");
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      password?: string;
      role?: string;
    };
    const role = parseRole(body.role);
    if (!body.email || !body.password || !role) {
      return NextResponse.json({ error: "Correo, contraseña y rol son obligatorios" }, { status: 400 });
    }
    const user = await createUser({
      email: body.email,
      name: body.name,
      password: body.password,
      role,
    });
    return NextResponse.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}
