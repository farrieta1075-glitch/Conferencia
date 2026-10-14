export const WEEKDAYS = [
  { id: 0, label: "Domingo" },
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
] as const;

export type WeekdayId = (typeof WEEKDAYS)[number]["id"];

export interface DayWindow {
  day: WeekdayId;
  start: string;
  end: string;
}

export interface EditorSchedule {
  mode: "once" | "weekly";
  start?: string;
  end?: string;
  date?: string;
  days?: WeekdayId[];
  windows?: DayWindow[];
}

const WEEKDAY_INDEX: Record<string, WeekdayId> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad(value: string) {
  return value.padStart(2, "0");
}

export function mexicoParts(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === "24" ? "00" : pad(parts.hour ?? "00");
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${pad(parts.minute ?? "00")}`,
    weekday: WEEKDAY_INDEX[parts.weekday ?? ""] ?? 0,
  };
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN;
  return hours * 60 + minutes;
}

export function normalizeTime(value: string): string {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${pad(match[1]!)}:${match[2]}`;
}

export function isValidTime(value: string): boolean {
  const normalized = normalizeTime(value);
  return /^\d{2}:\d{2}$/.test(normalized) && Number.isFinite(timeToMinutes(normalized));
}

function parseWindow(raw: unknown): DayWindow | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<DayWindow>;
  const day = Number(value.day);
  const start = normalizeTime(value.start ?? "");
  const end = normalizeTime(value.end ?? "");
  if (!Number.isInteger(day) || day < 0 || day > 6) return undefined;
  if (!isValidTime(start) || !isValidTime(end)) return undefined;
  if (timeToMinutes(end) <= timeToMinutes(start)) return undefined;
  return { day: day as WeekdayId, start, end };
}

function uniqueWindows(windows: DayWindow[]): DayWindow[] {
  const map = new Map<WeekdayId, DayWindow>();
  for (const window of windows) map.set(window.day, window);
  return [...map.values()].sort((a, b) => a.day - b.day);
}

export function parseSchedule(raw: unknown): EditorSchedule | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<EditorSchedule> & { windows?: unknown };
  if (value.mode !== "once" && value.mode !== "weekly") return undefined;

  if (value.mode === "once") {
    const start = normalizeTime(value.start ?? "");
    const end = normalizeTime(value.end ?? "");
    if (!isValidTime(start) || !isValidTime(end)) return undefined;
    if (timeToMinutes(end) <= timeToMinutes(start)) return undefined;
    if (!value.date || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return undefined;
    return { mode: "once", date: value.date, start, end };
  }

  const fromWindows = Array.isArray(value.windows)
    ? uniqueWindows(value.windows.flatMap((item) => parseWindow(item) ?? []))
    : [];
  if (fromWindows.length) {
    return {
      mode: "weekly",
      windows: fromWindows,
      days: fromWindows.map((item) => item.day),
    };
  }

  const start = normalizeTime(value.start ?? "");
  const end = normalizeTime(value.end ?? "");
  const days = [
    ...new Set(
      (value.days ?? [])
        .map((day) => Number(day))
        .filter((day): day is WeekdayId => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ].sort((a, b) => a - b);
  if (!days.length || !isValidTime(start) || !isValidTime(end)) return undefined;
  if (timeToMinutes(end) <= timeToMinutes(start)) return undefined;
  return {
    mode: "weekly",
    start,
    end,
    days,
    windows: days.map((day) => ({ day, start, end })),
  };
}

export function windowsFor(schedule: EditorSchedule | undefined): DayWindow[] {
  if (!schedule || schedule.mode !== "weekly") return [];
  if (schedule.windows?.length) return uniqueWindows(schedule.windows);
  const start = schedule.start;
  const end = schedule.end;
  if (!start || !end) return [];
  return (schedule.days ?? []).map((day) => ({ day, start, end }));
}

export function todayWindow(schedule: EditorSchedule | undefined, at = new Date()) {
  if (!schedule) return null;
  const now = mexicoParts(at);
  if (schedule.mode === "once") {
    if (schedule.date !== now.date || !schedule.start || !schedule.end) return null;
    return { start: schedule.start, end: schedule.end, date: now.date };
  }
  const window = windowsFor(schedule).find((item) => item.day === now.weekday);
  if (!window) return null;
  return { start: window.start, end: window.end, date: now.date };
}

function mexicoDateTimeToMs(date: string, time: string): number {
  const target = `${date}T${time}`;
  let lo = Date.parse(`${date}T00:00:00.000Z`) - 12 * 3_600_000;
  let hi = Date.parse(`${date}T00:00:00.000Z`) + 36 * 3_600_000;
  while (hi - lo > 30_000) {
    const mid = Math.floor((lo + hi) / 2);
    const parts = mexicoParts(new Date(mid));
    const current = `${parts.date}T${parts.time}`;
    if (current === target) return mid;
    if (current < target) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function accessUntilMs(schedule: EditorSchedule | undefined, at = new Date()): number | null {
  const window = todayWindow(schedule, at);
  if (!window) return null;
  const now = mexicoParts(at);
  const nowMin = timeToMinutes(now.time);
  const startMin = timeToMinutes(window.start);
  const endMin = timeToMinutes(window.end);
  if (!Number.isFinite(nowMin) || !Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
  if (nowMin < startMin || nowMin >= endMin) return null;
  return mexicoDateTimeToMs(window.date, window.end);
}

function weekdayLabel(id: WeekdayId) {
  return WEEKDAYS.find((item) => item.id === id)?.label ?? String(id);
}

export function scheduleLabel(schedule: EditorSchedule | undefined): string {
  if (!schedule) return "Sin horario";
  if (schedule.mode === "once") {
    return `Hoy ${schedule.date}: ${schedule.start} – ${schedule.end}`;
  }
  const windows = windowsFor(schedule);
  if (!windows.length) return "Sin horario";
  const groups = new Map<string, WeekdayId[]>();
  for (const window of windows) {
    const key = `${window.start} – ${window.end}`;
    groups.set(key, [...(groups.get(key) ?? []), window.day]);
  }
  return [...groups.entries()]
    .map(([range, days]) => `${days.map(weekdayLabel).join(", ")}: ${range}`)
    .join(" · ");
}
