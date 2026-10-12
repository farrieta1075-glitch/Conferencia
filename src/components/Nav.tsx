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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy-mid pb-[env(safe-area-inset-bottom)] lg:static lg:border-t-0 lg:border-r lg:pb-0">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 py-1.5 lg:w-56 lg:flex-col lg:px-3 lg:py-6 max-[1100px]:landscape:py-1">
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/" || pathname.startsWith("/seccion")
              : pathname.startsWith(link.href);
          return (
            <li key={link.href} className="shrink-0 lg:w-full">
              <Link
                href={link.href}
                className={`flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl px-2 text-[13px] font-semibold sm:min-h-12 sm:px-3 sm:text-sm lg:justify-start max-[1100px]:landscape:min-h-10 ${
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
