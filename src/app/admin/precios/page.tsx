"use client";

import { useState } from "react";
import { useEventStore } from "@/context/EventStore";
import { RoleGate, useCan } from "@/components/auth/RoleGate";
import { AREA_LABELS, AREA_ORDER } from "@/lib/constants";
import { money } from "@/lib/format";
import type { AreaId, DiscountType, Promotion } from "@/lib/types";

const emptyPromo = (): Promotion => ({
  id: `promo-${Date.now()}`,
  name: "",
  zoneIds: ["preferente"],
  discountType: "percent",
  discountValue: 10,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
});

export default function PreciosAdminPage() {
  const { state, setPrice, upsertPromotion, removePromotion } = useEventStore();
  const [draft, setDraft] = useState<Promotion>(emptyPromo);
  const canEdit = useCan("prices:edit");

  function toggleZone(id: AreaId) {
    setDraft((current) => ({
      ...current,
      zoneIds: current.zoneIds.includes(id)
        ? current.zoneIds.filter((item) => item !== id)
        : [...current.zoneIds, id],
    }));
  }

  function savePromo() {
    if (!draft.name.trim() || !draft.zoneIds.length || !canEdit) return;
    void upsertPromotion({ ...draft, name: draft.name.trim() });
    setDraft(emptyPromo());
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="text-xs uppercase tracking-wider text-bronze-dark">Módulo 3 · Admin</p>
        <h2 className="font-display text-3xl">Precios por área</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {state.prices.map((item) => (
            <label key={item.areaId} className="text-sm font-medium text-ink-muted">
              {AREA_LABELS[item.areaId]}
              <div className="mt-1 flex gap-2">
                <input
                  className="field"
                  type="number"
                  min={0}
                  value={item.basePrice}
                  disabled={!canEdit}
                  onChange={(e) => void setPrice(item.areaId, Number(e.target.value))}
                />
                <span className="self-center text-ink">{money(item.basePrice)}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h3 className="font-display text-2xl">Promociones</h3>
        <p className="text-sm text-ink-muted">
          El nombre de la promoción vigente se imprime en cada boleto vendido durante su periodo.
        </p>
        <div className="mt-4 grid gap-3">
          <label className="text-sm font-medium text-ink-muted">
            Nombre
            <input
              className="field mt-1"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">Zonas afectadas</p>
            <div className="flex flex-wrap gap-2">
              {AREA_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={
                    draft.zoneIds.includes(id) ? "btn-primary px-3" : "btn-ghost px-3"
                  }
                  onClick={() => toggleZone(id)}
                >
                  {AREA_LABELS[id]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-ink-muted">
              Tipo
              <select
                className="field mt-1"
                value={draft.discountType}
                onChange={(e) =>
                  setDraft({ ...draft, discountType: e.target.value as DiscountType })
                }
              >
                <option value="percent">Porcentaje %</option>
                <option value="fixed">Monto fijo $</option>
              </select>
            </label>
            <label className="text-sm font-medium text-ink-muted">
              Valor
              <input
                className="field mt-1"
                type="number"
                min={0}
                value={draft.discountValue}
                onChange={(e) =>
                  setDraft({ ...draft, discountValue: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-sm font-medium text-ink-muted">
              Vigencia
              <input
                className="field mt-1"
                type="datetime-local"
                value={draft.expiresAt.slice(0, 16)}
                onChange={(e) =>
                  setDraft({ ...draft, expiresAt: new Date(e.target.value).toISOString() })
                }
              />
            </label>
          </div>
          <button type="button" className="btn-primary" onClick={savePromo}>
            Guardar promoción
          </button>
        </div>

        <ul className="mt-5 space-y-2">
          {state.promotions.map((promo) => (
            <li
              key={promo.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface px-4 py-3"
            >
              <div>
                <p className="font-semibold">{promo.name}</p>
                <p className="text-sm text-ink-muted">
                  {promo.discountType === "percent"
                    ? `${promo.discountValue}%`
                    : money(promo.discountValue)}{" "}
                  · {promo.zoneIds.map((id) => AREA_LABELS[id]).join(", ")}
                </p>
              </div>
              <RoleGate allow="prices:edit">
                <button type="button" className="btn-ghost" onClick={() => void removePromotion(promo.id)}>
                  Eliminar
                </button>
              </RoleGate>
            </li>
          ))}
          {!state.promotions.length && (
            <li className="text-sm text-ink-muted">Aún no hay promociones activas.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
