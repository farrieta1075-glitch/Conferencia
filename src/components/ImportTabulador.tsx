"use client";

import { useState } from "react";
import { useEventStore } from "@/context/EventStore";
import { RoleGate } from "@/components/auth/RoleGate";
import { TABULADOR_JSON_EXAMPLE } from "@/lib/tabulador/generator";
import { parseTabulador, tabuladorToPrettyJson } from "@/lib/tabulador/loader";
import { TABULADOR_XLSX_EXAMPLE, xlsxToTabuladorInput } from "@/lib/tabulador/xlsx";

function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  );
}

export function ImportTabulador() {
  const { state, importTabulador, tabuladorCount } = useEventStore();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetAssignments, setResetAssignments] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const raw = isExcelFile(file)
        ? await xlsxToTabuladorInput(await file.arrayBuffer())
        : JSON.parse(await file.text());
      const parsed = parseTabulador(raw);
      await importTabulador(parsed, resetAssignments);
      setMessage(`Tabulador cargado: ${parsed.venueName} (${file.name}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo");
    } finally {
      setBusy(false);
    }
  }

  function downloadCurrent() {
    const blob = new Blob([tabuladorToPrettyJson(state.tabulador)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tabulador-auditorio-nacional.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card p-5">
      <h3 className="font-display text-2xl">Importar tabulador real</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Carga un JSON o un Excel (.xlsx) con Orden, Área, Sección, Fila y Asiento. El orden 1
        queda abajo (hacia el escenario) y sube hasta n. En Asiento puedes marcar pasillos{" "}
        <code>- P1-</code> / <code>- P2-</code>, huecos <code>- C -</code> y columnas vacías{" "}
        <code>- E -</code>. Asientos en tabulador: {tabuladorCount}. Capacidad oficial:{" "}
        {state.tabulador.officialCapacity}.
      </p>
      <RoleGate
        allow="tabulador:import"
        fallback={<p className="mt-3 text-sm text-ink-muted">Tu rol solo puede consultar el tabulador.</p>}
      >
        <label className="mt-4 flex min-h-12 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={resetAssignments}
            onChange={(e) => setResetAssignments(e.target.checked)}
          />
          Reiniciar disponibilidad al importar (todos los asientos quedan sin venta)
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className={`btn-primary cursor-pointer ${busy ? "opacity-60" : ""}`}>
            {busy ? "Procesando…" : "Cargar JSON / Excel"}
            <input
              type="file"
              accept=".json,.xlsx,.xls,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onFile(file);
              }}
            />
          </label>
          <button type="button" className="btn-ghost" onClick={downloadCurrent}>
            Descargar tabulador actual
          </button>
        </div>
      </RoleGate>
      {message && <p className="mt-3 text-sm text-available">{message}</p>}
      {error && <p className="mt-3 text-sm text-sold">{error}</p>}
      <details className="mt-4 text-xs text-ink-muted">
        <summary className="cursor-pointer text-sm font-semibold">Esquema JSON de ejemplo</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-navy p-3 text-slate-100">
          {TABULADOR_JSON_EXAMPLE}
        </pre>
      </details>
      <details className="mt-3 text-xs text-ink-muted">
        <summary className="cursor-pointer text-sm font-semibold">Columnas Excel de ejemplo</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-navy p-3 text-slate-100">
          {TABULADOR_XLSX_EXAMPLE}
        </pre>
      </details>
    </div>
  );
}
