import { NextResponse } from "next/server";
import { jsonError, requireSuperuser } from "@/lib/auth/api";
import { importCampusSalesWorkbook, previewCampusSalesWorkbook } from "@/lib/import/campusSales";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireSuperuser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Adjunta el Excel de ventas de campus" }, { status: 400 });
    }
    const buffer = await file.arrayBuffer();
    const preview = String(form.get("preview") ?? "") === "1";
    if (preview) {
      const campuses = await previewCampusSalesWorkbook(buffer);
      return NextResponse.json({ ok: true, preview: true, campuses });
    }
    const campuses = await importCampusSalesWorkbook(buffer);
    return NextResponse.json({ ok: true, campuses });
  } catch (error) {
    return jsonError(error);
  }
}
