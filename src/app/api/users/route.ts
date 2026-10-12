import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import { createUser, listUsers, publicUser } from "@/lib/auth/users";
import { parseRole } from "@/lib/auth/roles";
import { parseCampus } from "@/lib/campus";

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
      campus?: string;
    };
    const role = parseRole(body.role);
    const campus = parseCampus(body.campus);
    if (!body.email || !body.password || !role || !campus) {
      return NextResponse.json({ error: "Correo, contraseña, rol y campus son obligatorios" }, { status: 400 });
    }
    const user = await createUser({
      email: body.email,
      name: body.name,
      password: body.password,
      role,
      campus,
    });
    return NextResponse.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}
