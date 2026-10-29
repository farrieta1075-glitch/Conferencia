"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useEventStore } from "@/context/EventStore";
import { DEFAULT_NOTIFY_TEMPLATES, sortedNotifyTemplates } from "@/lib/notifyTemplates";
import type { NotifyTemplate } from "@/lib/types";

export function NotifyTemplatesEditor() {
  const { data: session } = useSession();
  const isSuperuser = session?.user?.email?.trim().toLowerCase() === "admin@auditorio.local";
  const { state, saveNotifyTemplates } = useEventStore();
  const [draft, setDraft] = useState<NotifyTemplate[]>(() => sortedNotifyTemplates(state.notifyTemplates));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(sortedNotifyTemplates(state.notifyTemplates));
  }, [state.notifyTemplates]);

  if (!isSuperuser) return null;

  function update(id: string, patch: Partial<NotifyTemplate>) {
    setDraft((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setSaved(false);
  }

  function move(id: string, direction: -1 | 1) {
    setDraft((current) => {
      const ordered = sortedNotifyTemplates(current);
      const index = ordered.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return current;
      const copy = [...ordered];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy.map((row, order) => ({ ...row, order: order + 1 }));
    });
    setSaved(false);
  }

  function addTemplate() {
    const order = draft.reduce((max, item) => Math.max(max, item.order), 0) + 1;
    setDraft((current) => [
      ...current,
      {
        id: `ntf-${Date.now()}`,
        label: "Nuevo mensaje",
        body: "¡Hola, [Nombre]! 👋",
        order,
      },
    ]);
    setSaved(false);
  }

  function removeTemplate(id: string) {
    if (draft.length <= 1) {
      setError("Deja al menos un tipo de comunicación");
      return;
    }
    if (!window.confirm("¿Quitar este tipo de comunicación?")) return;
    setDraft((current) =>
      sortedNotifyTemplates(current.filter((item) => item.id !== id)).map((item, index) => ({
        ...item,
        order: index + 1,
      })),
    );
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await saveNotifyTemplates(draft);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar las plantillas");
    } finally {
      setBusy(false);
    }
  }

  function restoreDefaults() {
    if (!window.confirm("¿Restaurar los 5 mensajes originales? Se perderán los cambios no guardados.")) return;
    setDraft(DEFAULT_NOTIFY_TEMPLATES);
    setSaved(false);
  }

  return (
    <div className="card mt-6 max-w-4xl p-6">
      <h3 className="font-display text-2xl">Tipos de comunicación</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Estos mensajes aparecen en Notificar compra, en el orden que indiques. Variables: [Nombre],
        [Sección], [Zona], [Asientos], [N], [fecha de parcialidad], [compra / pago exitoso]. Incluye
        iconos/emojis en el texto; al enviar se copian al portapapeles para WhatsApp Business.
      </p>
      <div className="mt-4 grid gap-4">
        {sortedNotifyTemplates(draft).map((item, index) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[4.5rem] text-sm font-medium text-ink-muted">
                Orden
                <input
                  className="field mt-1"
                  type="number"
                  min={1}
                  value={item.order}
                  onChange={(event) => update(item.id, { order: Number(event.target.value) || 1 })}
                />
              </label>
              <label className="min-w-0 flex-1 text-sm font-medium text-ink-muted">
                Nombre del tipo
                <input
                  className="field mt-1"
                  value={item.label}
                  onChange={(event) => update(item.id, { label: event.target.value })}
                />
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn-ghost px-3"
                  disabled={index === 0}
                  onClick={() => move(item.id, -1)}
                >
                  Subir
                </button>
                <button
                  type="button"
                  className="btn-ghost px-3"
                  disabled={index === draft.length - 1}
                  onClick={() => move(item.id, 1)}
                >
                  Bajar
                </button>
                <button type="button" className="btn-ghost px-3 text-sold" onClick={() => removeTemplate(item.id)}>
                  Quitar
                </button>
              </div>
            </div>
            <label className="mt-2 block text-sm font-medium text-ink-muted">
              Mensaje
              <textarea
                className="mt-1 min-h-36 w-full rounded-xl border border-slate-200 p-3 text-sm leading-relaxed"
                value={item.body}
                onChange={(event) => update(item.id, { body: event.target.value })}
              />
            </label>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={addTemplate}>
          Agregar tipo
        </button>
        <button type="button" className="btn-ghost" onClick={restoreDefaults}>
          Restaurar originales
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Guardando…" : "Guardar tipos de comunicación"}
        </button>
      </div>
      {saved ? <p className="mt-2 text-sm text-available">Tipos de comunicación guardados.</p> : null}
      {error ? <p className="mt-2 text-sm text-sold">{error}</p> : null}
    </div>
  );
}
