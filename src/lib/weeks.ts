export function weekStart(iso: string): string {
  const date = new Date(iso);
  const day = (date.getDay() + 6) % 7;
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDay: string, days: number): string {
  const date = new Date(`${isoDay}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isoWeekNumber(weekStartIso: string): number {
  const date = new Date(`${weekStartIso}T12:00:00`);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
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
