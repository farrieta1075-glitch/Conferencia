/** General.png uses unified blocks (401, not 401A/401B). */
export function canonicalizeSectionId(raw: unknown): string {
  const id = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[-_./]/g, "");
  const match = id.match(/^(\d{2,4})[ABC]$/);
  return match ? match[1] : id;
}

export function layoutSectionId(sectionId: string): string {
  return canonicalizeSectionId(sectionId);
}
