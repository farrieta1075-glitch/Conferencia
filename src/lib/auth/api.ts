import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { hasPermission, type Permission, type Role } from "@/lib/auth/roles";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requirePermission(permission: Permission) {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;
  if (!session?.user || !role) {
    throw new HttpError(401, "No autenticado");
  }
  if (!hasPermission(role, permission)) {
    throw new HttpError(403, "Forbidden: no tienes permisos suficientes");
  }
  return { session, role, user: session.user };
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Error interno";
  return NextResponse.json({ error: message }, { status: 500 });
}
