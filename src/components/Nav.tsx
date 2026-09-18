"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentRole } from "@/components/auth/RoleGate";
import { navLinksForRole } from "@/lib/auth/routes";

export function Nav() {
  const pathname = usePathname();
  const role = useCurrentRole();
  const links = navLinksForRole(role);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy-mid lg:static lg:border-t-0 lg:border-r">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 py-2 lg:w-56 lg:flex-col lg:px-3 lg:py-6">
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/" || pathname.startsWith("/seccion")
              : pathname.startsWith(link.href);
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className={`flex min-h-12 items-center justify-center rounded-xl px-3 text-sm font-semibold lg:justify-start ${
                  active
                    ? "bg-bronze text-white"
                    : "text-slate-200 hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
