export function weekStart(iso: string): string {
  const date = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(isoDay: string, days: number): string {
  const date = new Date(`${isoDay}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isoWeekNumber(weekStartIso: string): number {
  const thursday = new Date(`${weekStartIso}T12:00:00`);
  thursday.setDate(thursday.getDate() + 4);
  thursday.setHours(0, 0, 0, 0);
  const week1 = new Date(thursday.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((thursday.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  );
}

export function weekLabel(weekStartIso: string): string {
  return `sem${isoWeekNumber(weekStartIso)}`;
}

export function dayLabel(isoDay: string): string {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "2-digit" }).format(
    new Date(`${isoDay}T12:00:00`),
  );
}

export function enumerateWeeks(fromStart: string, toStart: string): string[] {
  const weeks: string[] = [];
  let cursor = fromStart;
  while (cursor <= toStart) {
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}
