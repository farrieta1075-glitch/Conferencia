"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";

export function EditorAccessGuard() {
  const { data } = useSession();
  const role = data?.user?.role;
  const until = data?.user?.accessUntil;

  useEffect(() => {
    if (role !== "EDITOR") return;
    const end = Number(until ?? 0);
    const remaining = end - Date.now();
    if (!end || remaining <= 0) {
      void signOut({ callbackUrl: "/login?error=horario" });
      return;
    }
    const timer = window.setTimeout(() => {
      void signOut({ callbackUrl: "/login?error=horario" });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [role, until]);

  return null;
}
