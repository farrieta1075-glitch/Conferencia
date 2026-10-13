export function logoCacheKey(dataUrl?: string): string {
  if (!dataUrl) return "0";
  return `${dataUrl.length}-${dataUrl.slice(-12)}`;
}
