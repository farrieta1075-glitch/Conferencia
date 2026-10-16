import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/auth/api";
import { importCampusSalesWorkbook } from "@/lib/import/campusSales";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { role } = await requirePermission("users:manage");
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Solo un administrador puede cargar ventas de campus" }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Adjunta el Excel de ventas de campus" }, { status: 400 });
    }
    const buffer = await file.arrayBuffer();
    const campuses = await importCampusSalesWorkbook(buffer);
    return NextResponse.json({ ok: true, campuses });
  } catch (error) {
    return jsonError(error);
  }
}
