import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { hasPermission, parseRole } from "@/lib/auth/roles";
import { permissionForRequest } from "@/lib/auth/routes";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const permission = permissionForRequest(pathname, req.method);
  if (!permission) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const role = parseRole(req.auth?.user?.role);

  if (!req.auth || !role) {
    if (isApi) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  if (!hasPermission(role, permission)) {
    if (isApi) {
      return NextResponse.json(
        { error: "Forbidden: no tienes permisos suficientes" },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL("/forbidden", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
