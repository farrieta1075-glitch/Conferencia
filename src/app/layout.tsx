import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import { EventStoreProvider } from "@/context/EventStore";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-cormorant",
});

export const metadata: Metadata = {
  title: "Boletos Auditorio Nacional",
  description:
    "PWA de venta y control de boletos del Auditorio Nacional, Ciudad de México.",
  applicationName: "Boletos AN",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Boletos AN",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B132B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${dmSans.variable} ${dmSans.className} ${cormorant.variable} antialiased`}>
        <AuthSessionProvider>
          <EventStoreProvider>
            <AppShell>{children}</AppShell>
          </EventStoreProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
