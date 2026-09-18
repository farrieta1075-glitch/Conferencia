export function money(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatLiveClock(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function seatId(sectionId: string, rowId: string, number: number): string {
  return `${sectionId}|${rowId}|${number}`;
}

export function parseSeatId(id: string): {
  sectionId: string;
  rowId: string;
  number: number;
} {
  const [sectionId, rowId, number] = id.split("|");
  return { sectionId, rowId, number: Number(number) };
}
