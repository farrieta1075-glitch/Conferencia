"use client";

import { useEffect } from "react";
import { useEventStore } from "@/context/EventStore";
import { logoCacheKey } from "@/lib/appIconKey";

function upsertLink(rel: string, href: string, extra?: Record<string, string>) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      link.setAttribute(key, value);
    }
  }
  link.href = href;
}

export function SyncPwaIcon() {
  const logoDataUrl = useEventStore().state.event.logoDataUrl;
  useEffect(() => {
    const v = encodeURIComponent(logoCacheKey(logoDataUrl));
    upsertLink("apple-touch-icon", `/apple-icon?v=${v}`, { sizes: "180x180" });
    upsertLink("manifest", `/manifest.webmanifest?v=${v}`);
  }, [logoDataUrl]);
  return null;
}
