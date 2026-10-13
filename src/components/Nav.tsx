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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy-mid pb-[env(safe-area-inset-bottom)] lg:static lg:h-full lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-r lg:pb-0 phone-landscape:static phone-landscape:h-auto phone-landscape:w-[4.65rem] phone-landscape:shrink-0 phone-landscape:self-stretch phone-landscape:overflow-y-auto phone-landscape:border-t-0 phone-landscape:border-r phone-landscape:pb-0">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 py-1.5 lg:w-56 lg:flex-col lg:px-3 lg:py-6 phone-landscape:h-full phone-landscape:w-full phone-landscape:flex-col phone-landscape:gap-0.5 phone-landscape:overflow-y-auto phone-landscape:px-1 phone-landscape:py-1">
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/" || pathname.startsWith("/seccion")
              : pathname.startsWith(link.href);
          return (
            <li key={link.href} className="shrink-0 lg:w-full">
              <Link
                href={link.href}
                className={`flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl px-2 text-[13px] font-semibold sm:min-h-12 sm:px-3 sm:text-sm lg:justify-start phone-landscape:min-h-8 phone-landscape:whitespace-normal phone-landscape:px-1 phone-landscape:py-1 phone-landscape:text-center phone-landscape:text-[10px] phone-landscape:leading-tight ${
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
