"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
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

interface CampusClientDiff {
  campus: string;
  ignored?: boolean;
  modified: number;
  added: number;
  removed: number;
  changed: number;
  skippedForeign: number;
  skippedInvalid: number;
}

export function ImportCampusSales() {
  const { data: session } = useSession();
  const isSuperuser = session?.user?.email?.trim().toLowerCase() === "admin@auditorio.local";
  const { reloadFromSheets } = useEventStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CampusClientDiff[] | null>(null);
  const [qroMessage, setQroMessage] = useState("");
  const [qroError, setQroError] = useState("");

  if (!isSuperuser) return null;

  async function previewFile(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("preview", "1");
      const result = await apiFetch<{ ok: boolean; campuses: CampusClientDiff[] }>(
        "/api/import/campus-sales",
        { method: "POST", body },
      );
      setPendingFile(file);
      setPreview(result.campuses);
    } catch (err) {
      setPendingFile(null);
      setError(err instanceof Error ? err.message : "No se pudo leer el Excel");
    } finally {
      setBusy(false);
    }
  }

  async function applyPending() {
    if (!pendingFile) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", pendingFile);
      const result = await apiFetch<{ ok: boolean; campuses: CampusSalesImportSummary[] }>(
        "/api/import/campus-sales",
        { method: "POST", body },
      );
      await reloadFromSheets();
      setPreview(null);
      setPendingFile(null);
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

  function cancelPending() {
    setPendingFile(null);
    setPreview(null);
    setMessage("");
    setError("");
  }

  async function updateQroSheet() {
    setBusy(true);
    setQroError("");
    setQroMessage("");
    try {
      const result = await apiFetch<{
        ok: boolean;
        rows: number;
        withPayments: number;
        titularDiff: number;
        methodDiff: number;
      }>("/api/import/qro-sheet", { method: "POST" });
      setQroMessage(
        `Hoja QRO actualizada: ${result.withPayments} filas con pagos, ${result.titularDiff} titulares distintos, ${result.methodDiff} métodos distintos (${result.rows} asientos).`,
      );
    } catch (err) {
      setQroError(err instanceof Error ? err.message : "No se pudo actualizar la hoja QRO");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Actualizar ventas de otros campus</summary>
        <p className="mt-2 text-sm text-ink-muted">
          Sube el Excel (una pestaña por campus, por ejemplo TLC y CDMX). Si Vendido está vacío el
          asiento queda disponible. Mismo cliente y misma fecha de vendido = una compra, excepto
          Asistente, Voluntario/a o Coluntario, que se cargan boleto por boleto. No pagado =
          apartado. Forma de pago vacía = otro. Esta carga reemplaza ventas y disponibilidad de
          esos campus con el archivo más reciente. QRO no se modifica.
        </p>
        <label className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-bronze px-3 text-sm font-semibold text-white">
          {busy ? "Leyendo…" : "Elegir Excel de ventas"}
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void previewFile(file);
            }}
          />
        </label>
        {preview ? (
          <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold">Cambios previstos en Cliente</p>
            {preview.map((item) =>
              item.ignored ? (
                <p key={item.campus} className="text-ink-muted">
                  {item.campus}: no se modifica.
                </p>
              ) : (
                <p key={item.campus}>
                  <span className="font-semibold">{item.campus}:</span> {item.modified} registros
                  modificados — {item.added} se agrega información, {item.removed} se elimina
                  información, {item.changed} cambian
                  {item.skippedForeign ? ` · ${item.skippedForeign} omitidos` : ""}
                  {item.skippedInvalid ? ` · ${item.skippedInvalid} inválidos` : ""}.
                </p>
              ),
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="inline-flex min-h-10 items-center rounded-lg bg-bronze px-3 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy || preview.every((item) => item.ignored)}
                onClick={() => void applyPending()}
              >
                {busy ? "Cargando…" : "Cargar ventas de otros campus"}
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold disabled:opacity-50"
                disabled={busy}
                onClick={cancelPending}
              >
                No cargar
              </button>
            </div>
          </div>
        ) : null}
        {message ? <p className="mt-2 text-sm text-available">{message}</p> : null}
        {error ? <p className="mt-2 text-sm text-sold">{error}</p> : null}
      </details>

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Actualizar hoja QRO</summary>
        <p className="mt-2 text-sm text-ink-muted">
          Escribe en la columna Q los pagos de cada asiento (Apartado con monto y fecha). Si el
          titular no coincide con Cliente, va en la columna R; si el método no coincide con Forma de
          Pago, va en la columna S (Tarjeta o Efectivo).
        </p>
        <button
          type="button"
          className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-bronze px-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void updateQroSheet()}
        >
          {busy ? "Actualizando…" : "Actualizar hoja QRO"}
        </button>
        {qroMessage ? <p className="mt-2 text-sm text-available">{qroMessage}</p> : null}
        {qroError ? <p className="mt-2 text-sm text-sold">{qroError}</p> : null}
      </details>
    </div>
  );
}
