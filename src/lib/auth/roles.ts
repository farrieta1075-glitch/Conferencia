export const ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "maps:read",
  "seats:read",
  "seats:edit",
  "tabulador:import",
  "event:edit",
  "prices:edit",
  "sales:create",
  "tickets:read",
  "tickets:edit",
  "payments:complete",
  "venues:delete",
  "users:manage",
  "sheets:sync",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  VIEWER: ["maps:read", "seats:read"],
  EDITOR: [
    "maps:read",
    "seats:read",
    "seats:edit",
    "tabulador:import",
    "event:edit",
    "prices:edit",
    "sales:create",
    "tickets:read",
    "tickets:edit",
    "payments:complete",
    "sheets:sync",
  ],
  ADMIN: PERMISSIONS,
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function parseRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return isRole(normalized) ? normalized : null;
}

export function roleLabel(role: Role): string {
  if (role === "ADMIN") return "Administrador";
  if (role === "EDITOR") return "Editor";
  return "Consulta";
}
