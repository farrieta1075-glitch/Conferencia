"use client";

import { useEffect } from "react";
import { Header } from "./Header";
import { Nav } from "./Nav";
import { RegisterSW } from "./RegisterSW";
import { SalesFocusProvider, useSalesFocus } from "@/context/SalesFocus";
import { usePathname } from "next/navigation";

function ClearSalesFocusOffMap() {
  const pathname = usePathname();
  const focus = useSalesFocus();
  const clearFocus = focus?.clearFocus;
  const isSales = pathname === "/" || pathname.startsWith("/seccion");
  useEffect(() => {
    if (!isSales) clearFocus?.();
  }, [clearFocus, isSales]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") {
    return <>{children}</>;
  }

  const isSales = pathname === "/" || pathname.startsWith("/seccion");

  return (
    <SalesFocusProvider>
      <ClearSalesFocusOffMap />
      <div className="flex h-dvh flex-col overflow-hidden bg-navy">
        <RegisterSW />
        <Header compact={isSales} />
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden lg:flex-row">
          <Nav />
          <main
            className={
              isSales
                ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-surface p-1.5 pb-[calc(4.1rem+env(safe-area-inset-bottom))] sm:p-2 lg:p-4 lg:pb-4 max-[1100px]:landscape:p-1 max-[1100px]:landscape:pb-[calc(3.35rem+env(safe-area-inset-bottom))]"
                : "min-h-0 flex-1 overflow-y-auto bg-surface p-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:p-6 lg:pb-8 max-[1100px]:landscape:p-2 max-[1100px]:landscape:pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
            }
          >
            {isSales ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : children}
          </main>
        </div>
      </div>
    </SalesFocusProvider>
  );
}
