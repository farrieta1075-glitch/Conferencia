import { renderAppIcon } from "@/lib/renderAppIcon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return renderAppIcon(512);
}
