export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (response.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error(payload.error ?? "No autenticado");
  }
  if (response.status === 403) {
    throw new Error(payload.error ?? "Forbidden: no tienes permisos suficientes");
  }
  if (!response.ok) {
    throw new Error(payload.error ?? `Error ${response.status}`);
  }
  return payload;
}
