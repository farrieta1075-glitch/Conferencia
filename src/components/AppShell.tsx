"use client";

import { Header } from "./Header";
import { Nav } from "./Nav";
import { RegisterSW } from "./RegisterSW";
import { SalesFocusProvider } from "@/context/SalesFocus";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <SalesFocusProvider>
      <div className="min-h-dvh bg-navy">
        <RegisterSW />
        <Header />
        <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-7xl flex-col lg:flex-row">
          <Nav />
          <main className="flex-1 bg-surface p-3 pb-24 lg:p-6 lg:pb-8 max-[1100px]:landscape:p-2 max-[1100px]:landscape:pb-20">{children}</main>
        </div>
      </div>
    </SalesFocusProvider>
  );
}
