import { renderAppIcon } from "@/lib/renderAppIcon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default async function Icon() {
  return renderAppIcon(192);
}
