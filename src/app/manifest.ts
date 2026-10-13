import type { MetadataRoute } from "next";
import { readEventLogoDataUrl } from "@/lib/appIcon";
import { logoCacheKey } from "@/lib/appIconKey";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const logo = await readEventLogoDataUrl();
  const v = encodeURIComponent(logoCacheKey(logo));
  return {
    name: "Boletos Auditorio Nacional",
    short_name: "Boletos AN",
    description: "Venta y control de boletos del Auditorio Nacional, CDMX.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0B132B",
    theme_color: "#0B132B",
    lang: "es-MX",
    icons: [
      {
        src: `/icon?v=${v}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icon-512?v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/apple-icon?v=${v}`,
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
