"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VenueMap } from "@/components/VenueMap";

function SalesMap() {
  const params = useSearchParams();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <VenueMap focusSectionId={params.get("s")} />
    </div>
  );
}

export default function VentaPage() {
  return (
    <Suspense fallback={<div className="card min-h-0 flex-1 bg-navy-deep" />}>
      <SalesMap />
    </Suspense>
  );
}
