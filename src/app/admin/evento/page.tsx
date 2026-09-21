"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import { useEventStore } from "@/context/EventStore";
import { apiFetch } from "@/lib/api/client";

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EventoAdminPage() {
  const { state, setEvent, resetVenue, reloadFromSheets } = useEventStore();
  const [name, setName] = useState(state.event.name);
  const [datetime, setDatetime] = useState(toLocalInput(state.event.datetime));
  const [logoDataUrl, setLogoDataUrl] = useState(state.event.logoDataUrl ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [sheetStatus, setSheetStatus] = useState("Comprobando Google Sheets…");

  useEffect(() => {
    setName(state.event.name);
    setDatetime(toLocalInput(state.event.datetime));
    setLogoDataUrl(state.event.logoDataUrl ?? "");
  }, [state.event]);

  useEffect(() => {
    void apiFetch<{
      configured: boolean;
      spreadsheetId: string;
      ready: boolean;
    }>("/api/sheets")
      .then((data) => {
        setSheetId(data.spreadsheetId);
        if (!data.configured) setSheetStatus("Faltan credenciales de Google en Vercel / .env.local");
        else if (!data.spreadsheetId) setSheetStatus("Falta GOOGLE_SHEETS_ID en las variables de entorno");
        else setSheetStatus("Hoja configurada. Pulsa sincronizar para cargar o guardar datos.");
      })
      .catch(() => setSheetStatus("No se pudo consultar el estado de Google Sheets"));
  }, []);

  async function onLogo(file: File) {
    const dataUrl = await compressImage(file);
    setLogoDataUrl(dataUrl);
  }

  async function save() {
    setError("");
    try {
      await setEvent({
        name: name.trim() || state.event.name,
        datetime: new Date(datetime).toISOString(),
        logoDataUrl: logoDataUrl || undefined,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  async function saveSheetId() {
    setError("");
    try {
      await apiFetch("/api/sheets", {
        method: "POST",
        body: JSON.stringify({ spreadsheetId: sheetId.trim() }),
      });
      await reloadFromSheets();
      setSheetStatus("Datos cargados desde Google Sheets.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sincronizar Google Sheets");
    }
  }

  return (
    <div className="card max-w-2xl p-6">
      <p className="text-xs uppercase tracking-wider text-bronze-dark">Módulo 1 · Admin</p>
      <h2 className="font-display text-3xl">Configuración del evento</h2>
      <div className="mt-5 grid gap-4">
        <label className="text-sm font-medium text-ink-muted">
          Nombre del evento
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm font-medium text-ink-muted">
          Fecha y hora oficial
          <input
            className="field mt-1"
            type="datetime-local"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-ink-muted">
          Imagen / logo
          <input
            className="field mt-1"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onLogo(file);
            }}
          />
        </label>
        {logoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUrl} alt="Logo del evento" className="h-20 w-20 rounded-2xl object-cover" />
        )}
        <button type="button" className="btn-primary" onClick={() => void save()}>
          Guardar evento
        </button>
        {saved && <p className="text-sm text-available">Cambios guardados.</p>}
        {error && <p className="text-sm text-sold">{error}</p>}
      </div>
      <div className="mt-8 border-t border-slate-200 pt-5">
        <h3 className="font-display text-2xl">Google Sheets</h3>
        <p className="mt-1 text-sm text-ink-muted">{sheetStatus}</p>
        <p className="mt-1 text-xs text-ink-muted">
          En Vercel el ID no se guarda en un archivo: usa la variable{" "}
          <code>GOOGLE_SHEETS_ID</code>. Este botón sincroniza y recarga la hoja.
        </p>
        <label className="mt-3 block text-sm font-medium text-ink-muted">
          ID de la hoja
          <input
            className="field mt-1"
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
            readOnly={Boolean(sheetId)}
          />
        </label>
        <button type="button" className="btn-secondary mt-3" onClick={() => void saveSheetId()}>
          Sincronizar y cargar Google Sheets
        </button>
      </div>
      <RoleGate allow="venues:delete">
        <div className="mt-8 border-t border-slate-200 pt-5">
          <h3 className="font-display text-2xl">Recinto</h3>
          <p className="text-sm text-ink-muted">
            Solo ADMIN puede eliminar el recinto (se restaura el mapa por defecto). EDITOR y práctica no
            tiene esta acción.
          </p>
          <button
            type="button"
            className="btn-ghost mt-3 text-sold"
            onClick={() => {
              if (window.confirm("¿Eliminar el recinto actual y volver al mapa base?")) {
                void resetVenue();
              }
            }}
          >
            Eliminar recinto
          </button>
        </div>
      </RoleGate>
    </div>
  );
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 256 / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
