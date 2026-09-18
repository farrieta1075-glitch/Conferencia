"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function SectionRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sectionId = decodeURIComponent(params.id ?? "");

  useEffect(() => {
    router.replace(sectionId ? `/?s=${encodeURIComponent(sectionId)}` : "/");
  }, [router, sectionId]);

  return <div className="card h-[min(70vh,760px)] bg-navy-deep" />;
}
