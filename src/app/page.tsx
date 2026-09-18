"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VenueMap } from "@/components/VenueMap";

function SalesMap() {
  const params = useSearchParams();
  return <VenueMap focusSectionId={params.get("s")} />;
}

export default function VentaPage() {
  return (
    <Suspense fallback={<div className="card h-[min(70vh,760px)] bg-navy-deep" />}>
      <SalesMap />
    </Suspense>
  );
}
