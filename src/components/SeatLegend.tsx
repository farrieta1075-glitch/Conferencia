import type { SeatStatus } from "@/lib/types";

const ITEMS: { status: SeatStatus | "sale"; label: string; color: string }[] = [
  { status: "unassigned", label: "No asignado", color: "#CBD5E1" },
  { status: "available", label: "Disponible", color: "#16A34A" },
  { status: "held", label: "Apartado", color: "#D97706" },
  { status: "sold", label: "Vendido", color: "#DC2626" },
];

export function SeatLegend({ showSaleZone = false }: { showSaleZone?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-3 text-sm text-ink-muted">
      {showSaleZone && (
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full bg-[#0A2A5C] ring-1 ring-white/40" />
          Zona con venta
        </li>
      )}
      {ITEMS.map((item) => (
        <li key={item.status} className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
