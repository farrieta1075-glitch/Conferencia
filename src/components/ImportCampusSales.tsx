"use client";

import { useState } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import { useEventStore } from "@/context/EventStore";
import { apiFetch } from "@/lib/api/client";

interface CampusSalesImportSummary {
  campus: string;
  available: number;
  sold: number;
  held: number;
  purchases: number;
  skippedForeign: number;
  skippedInvalid: number;
}

export function ImportCampusSales() {
  const { reloadFromSheets } = useEventStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onFile(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await apiFetch<{ ok: boolean; campuses: CampusSalesImportSummary[] }>(
        "/api/import/campus-sales",
        { method: "POST", body },
      );
      await reloadFromSheets();
      setMessage(
        result.campuses
          .map(
            (item) =>
              `${item.campus}: ${item.purchases} compras, ${item.sold} vendidos, ${item.held} apartados, ${item.available} disponibles` +
              (item.skippedForeign ? `, ${item.skippedForeign} omitidos (otro campus o duplicado)` : ""),
          )
          .join(" · "),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el Excel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RoleGate allow="users:manage">
      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Actualizar ventas de otros campus</summary>
        <p className="mt-2 text-sm text-ink-muted">
          Sube el Excel (una pestaña por campus, por ejemplo TLC y CDMX). Si Vendido está vacío el
          asiento queda disponible. Mismo cliente y misma fecha de vendido = una compra. No pagado
          = apartado. Forma de pago vacía = otro. Esta carga reemplaza ventas y disponibilidad de
          esos campus con el archivo más reciente. QRO no se modifica.
        </p>
        <label className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-bronze px-3 text-sm font-semibold text-white">
          {busy ? "Actualizando…" : "Cargar Excel de ventas"}
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onFile(file);
            }}
          />
        </label>
        {message ? <p className="mt-2 text-sm text-available">{message}</p> : null}
        {error ? <p className="mt-2 text-sm text-sold">{error}</p> : null}
      </details>
    </RoleGate>
  );
}
