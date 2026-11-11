import { formatWeekdayDay, mexicoDayStamp, mexicoWeekdayIndex } from "@/lib/format";

export function weekStart(iso: string): string {
  const day = mexicoDayStamp(iso);
  return addDays(day, -mexicoWeekdayIndex(iso));
}

export function addDays(isoDay: string, days: number): string {
  const date = new Date(`${isoDay.slice(0, 10)}T12:00:00-06:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return mexicoDayStamp(date.toISOString());
}

export function isoWeekNumber(weekStartIso: string): number {
  const [year, month, day] = addDays(weekStartIso, 4).split("-").map(Number);
  const thursday = new Date(Date.UTC(year, month - 1, day));
  const week1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      ((thursday.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7,
    )
  );
}

export function weekLabel(weekStartIso: string): string {
  return `sem${isoWeekNumber(weekStartIso)}`;
}

export function dayLabel(isoDay: string): string {
  return formatWeekdayDay(isoDay);
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
