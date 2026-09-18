"use client";

import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { hasPermission, type Permission, type Role } from "@/lib/auth/roles";

export function useCurrentRole(): Role | undefined {
  const { data } = useSession();
  return data?.user?.role;
}

export function useCan(permission: Permission): boolean {
  return hasPermission(useCurrentRole(), permission);
}

interface RoleGateProps {
  allow: Permission | Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGate({ allow, children, fallback = null }: RoleGateProps) {
  const role = useCurrentRole();
  const permissions = Array.isArray(allow) ? allow : [allow];
  const allowed = permissions.some((permission) => hasPermission(role, permission));
  return allowed ? children : fallback;
}
