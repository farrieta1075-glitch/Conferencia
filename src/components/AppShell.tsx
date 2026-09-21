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
      <div className={isSales ? "flex h-dvh flex-col overflow-hidden bg-navy" : "min-h-dvh bg-navy"}>
        <RegisterSW />
        <Header compact={isSales} />
        <div
          className={
            isSales
              ? "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden lg:flex-row"
              : "mx-auto flex min-h-[calc(100dvh-7rem)] max-w-7xl flex-col lg:flex-row"
          }
        >
          <Nav />
          <main
            className={
              isSales
                ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-surface p-2 pb-[4.25rem] lg:p-4 lg:pb-4"
                : "flex-1 bg-surface p-3 pb-24 lg:p-6 lg:pb-8 max-[1100px]:landscape:p-2 max-[1100px]:landscape:pb-20"
            }
          >
            {isSales ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : children}
          </main>
        </div>
      </div>
    </SalesFocusProvider>
  );
}
