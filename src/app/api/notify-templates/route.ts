import { NextResponse } from "next/server";
import { jsonError, requireSuperuser } from "@/lib/auth/api";
import { sortedNotifyTemplates } from "@/lib/notifyTemplates";
import { applySheetsDelta } from "@/lib/sheets/sync";
import type { NotifyTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseTemplates(value: unknown): NotifyTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = item as Partial<NotifyTemplate>;
      const id = String(row.id ?? "").trim() || `ntf-${Date.now()}-${index}`;
      const label = String(row.label ?? "").trim();
      const body = String(row.body ?? "");
      const order = Number(row.order);
      return {
        id,
        label,
        body,
        order: Number.isFinite(order) ? order : index + 1,
      };
    })
    .filter((item) => item.label && item.body.trim());
}

export async function PUT(request: Request) {
  try {
    await requireSuperuser();
    const payload = (await request.json()) as { templates?: unknown };
    const templates = sortedNotifyTemplates(parseTemplates(payload.templates));
    if (!templates.length) {
      return NextResponse.json({ error: "Deja al menos un tipo de comunicación" }, { status: 400 });
    }
    await applySheetsDelta({ notifyTemplates: templates });
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    return jsonError(error);
  }
}