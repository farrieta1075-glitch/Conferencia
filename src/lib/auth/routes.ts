import { hasPermission, type Permission, type Role } from "@/lib/auth/roles";

export function permissionForRequest(
  pathname: string,
  method: string,
): Permission | null {
  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/login" ||
    pathname === "/forbidden" ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon")
  ) {
    return null;
  }

  const verb = method.toUpperCase();

  if (pathname.startsWith("/api/users")) return "users:manage";
  if (pathname.startsWith("/api/venues") && verb === "DELETE") return "venues:delete";
  if (pathname.startsWith("/api/event")) return "event:edit";
  if (pathname.startsWith("/api/prices") || pathname.startsWith("/api/promotions")) {
    return "prices:edit";
  }
  if (pathname.startsWith("/api/import")) return "tabulador:import";
  if (pathname.match(/\/api\/purchases\/[^/]+\/pay/)) return "payments:complete";
  if (pathname.startsWith("/api/purchases") && verb === "GET") return "tickets:read";
  if (pathname.startsWith("/api/purchases") && verb === "POST") return "sales:create";
  if (pathname.startsWith("/api/purchases") && (verb === "PATCH" || verb === "PUT")) {
    return "tickets:edit";
  }
  if (pathname.startsWith("/api/seats") && (verb === "PATCH" || verb === "POST")) {
    return "seats:edit";
  }
  if (pathname.startsWith("/api/sheets") && verb === "POST") return "sheets:sync";
  if (pathname.startsWith("/api/")) return "maps:read";

  if (pathname.startsWith("/admin/usuarios")) return "users:manage";
  if (pathname.startsWith("/admin/boletos")) return "tickets:read";
  if (pathname.startsWith("/admin/precios")) return "prices:edit";
  if (pathname.startsWith("/admin/evento")) return "event:edit";
  if (pathname.startsWith("/admin/asientos")) return "seats:read";
  return "maps:read";
}

export function navLinksForRole(role: Role | undefined) {
  return [
    { href: "/", label: "Venta", permission: "maps:read" as const },
    { href: "/dashboard", label: "Dashboard", permission: "maps:read" as const },
    { href: "/admin/boletos", label: "Boletos", permission: "tickets:read" as const },
    { href: "/admin/evento", label: "Evento", permission: "event:edit" as const },
    { href: "/admin/asientos", label: "Asientos", permission: "seats:read" as const },
    { href: "/admin/precios", label: "Precios", permission: "prices:edit" as const },
    { href: "/admin/usuarios", label: "Usuarios", permission: "users:manage" as const },
  ].filter((link) => hasPermission(role, link.permission));
}
