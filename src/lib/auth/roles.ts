export const ROLES = ["ADMIN", "EDITOR", "PRACTICE", "VIEWER"] as const;
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

const EDITOR_PERMISSIONS = [
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
] as const;

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  VIEWER: ["maps:read", "seats:read"],
  PRACTICE: EDITOR_PERMISSIONS,
  EDITOR: [...EDITOR_PERMISSIONS, "sheets:sync"],
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

export function persistsToSheets(role: Role | undefined | null): boolean {
  return hasPermission(role, "sheets:sync");
}

export function roleLabel(role: Role): string {
  if (role === "ADMIN") return "Administrador";
  if (role === "EDITOR") return "Editor";
  if (role === "PRACTICE") return "Editor de práctica";
  return "Consulta";
}
