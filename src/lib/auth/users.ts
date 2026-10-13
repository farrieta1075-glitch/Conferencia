import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseRole, type Role } from "@/lib/auth/roles";
import { parseSchedule, type EditorSchedule } from "@/lib/auth/schedule";
import { DEFAULT_CAMPUS, parseCampus, type Campus } from "@/lib/campus";
import { sheetsConfigured } from "@/lib/sheets/client";
import { readUsersFromSheets, writeUsersToSheets } from "@/lib/sheets/users";

function campusForEmail(email: string, raw?: string): Campus {
  if (email === "admin@auditorio.local") return "ALL";
  return parseCampus(raw) ?? DEFAULT_CAMPUS;
}

export interface AuthUser {
  email: string;
  name: string;
  role: Role;
  campus: Campus;
  password?: string;
  passwordHash?: string;
  source: "env" | "file";
  schedule?: EditorSchedule;
}

const USERS_FILE = path.join(
  process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data"),
  "users.json",
);

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.includes(":")) {
    const [salt, hash] = stored.split(":");
    const test = scryptSync(password, salt, 64);
    const target = Buffer.from(hash, "hex");
    if (test.length !== target.length) return false;
    return timingSafeEqual(test, target);
  }
  return safeEqual(password, stored);
}

function parseEnvUsers(raw: string | undefined): AuthUser[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [emailRaw, password, roleRaw, campusRaw] = entry.split(":");
      const email = emailRaw.trim().toLowerCase();
      const role = parseRole(roleRaw);
      if (!email || !password || !role) return [];
      return [
        {
          email,
          name: emailRaw.trim(),
          role,
          campus: campusForEmail(email, campusRaw),
          password,
          source: "env" as const,
        },
      ];
    });
}

async function readFileUsers(): Promise<AuthUser[]> {
  try {
    const raw = await readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as AuthUser[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((user) => {
      const role = parseRole(user.role);
      if (!user.email || !role) return [];
      return [
        {
          email: String(user.email).trim().toLowerCase(),
          name: user.name || String(user.email),
          role,
          campus: campusForEmail(String(user.email).trim().toLowerCase(), user.campus),
          passwordHash: user.passwordHash,
          source: "file" as const,
          schedule: parseSchedule(user.schedule),
        },
      ];
    });
  } catch {
    return [];
  }
}

async function loadStoredUsers(): Promise<AuthUser[]> {
  const fileUsers = await readFileUsers();
  if (!sheetsConfigured()) return fileUsers;
  try {
    const sheetUsers = await readUsersFromSheets();
    const map = new Map<string, AuthUser>();
    for (const user of fileUsers) map.set(user.email, user);
    for (const user of sheetUsers) map.set(user.email, user);
    return [...map.values()];
  } catch {
    return fileUsers;
  }
}

async function saveStoredUsers(stored: AuthUser[]): Promise<void> {
  await mkdir(path.dirname(USERS_FILE), { recursive: true });
  await writeFile(USERS_FILE, JSON.stringify(stored, null, 2), "utf8");
  if (!sheetsConfigured()) {
    if (process.env.VERCEL) {
      throw new Error("Google Sheets no está configurado; no se pueden guardar usuarios en producción");
    }
    return;
  }
  const merged = new Map<string, AuthUser>();
  for (const user of stored) merged.set(user.email, user);
  for (const user of parseEnvUsers(process.env.AUTH_USERS)) {
    merged.set(user.email, mergeUser(merged.get(user.email), user));
  }
  await writeUsersToSheets([...merged.values()]);
}

function mergeUser(base: AuthUser | undefined, next: AuthUser): AuthUser {
  return {
    ...base,
    ...next,
    schedule: next.schedule ?? base?.schedule,
    passwordHash: next.passwordHash || base?.passwordHash,
    password: next.password || base?.password,
  };
}

export async function listUsers(): Promise<AuthUser[]> {
  const map = new Map<string, AuthUser>();
  for (const user of await loadStoredUsers()) map.set(user.email, user);
  for (const user of parseEnvUsers(process.env.AUTH_USERS)) {
    map.set(user.email, mergeUser(map.get(user.email), user));
  }
  return [...map.values()];
}

export async function findUserByEmail(email: string): Promise<AuthUser | undefined> {
  const needle = email.trim().toLowerCase();
  return (await listUsers()).find((user) => user.email === needle);
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<Omit<AuthUser, "password" | "passwordHash"> | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const stored = user.passwordHash ?? user.password;
  if (!stored || !verifyPassword(password, stored)) return null;
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    campus: user.campus,
    source: user.source,
    schedule: user.schedule,
  };
}

export async function createUser(input: {
  email: string;
  name?: string;
  password: string;
  role: Role;
  campus: Campus;
}): Promise<AuthUser> {
  const email = input.email.trim().toLowerCase();
  const existing = await listUsers();
  if (existing.some((user) => user.email === email)) {
    throw new Error("Ya existe un usuario con ese correo");
  }
  const next: AuthUser = {
    email,
    name: input.name?.trim() || email,
    role: input.role,
    campus: campusForEmail(email, input.campus),
    passwordHash: hashPassword(input.password),
    source: "file",
  };
  const stored = await loadStoredUsers();
  await saveStoredUsers([...stored, next]);
  return next;
}

export async function updateUserSchedule(email: string, schedule: EditorSchedule | undefined): Promise<AuthUser> {
  const needle = email.trim().toLowerCase();
  const current = await findUserByEmail(needle);
  if (!current) throw new Error("Usuario no encontrado");
  if (current.role !== "EDITOR") {
    throw new Error("El horario solo aplica a usuarios editores");
  }
  const stored = await loadStoredUsers();
  const nextUser: AuthUser = {
    ...current,
    email: needle,
    password: undefined,
    schedule,
    source: current.source,
  };
  const index = stored.findIndex((user) => user.email === needle);
  if (index >= 0) stored[index] = { ...stored[index], ...nextUser, passwordHash: stored[index].passwordHash || current.passwordHash };
  else stored.push({ ...nextUser, passwordHash: current.passwordHash });
  await saveStoredUsers(stored);
  const saved = await findUserByEmail(needle);
  if (!saved) throw new Error("No se pudo guardar el horario");
  return saved;
}

export async function deleteUser(email: string): Promise<void> {
  const needle = email.trim().toLowerCase();
  const envHit = parseEnvUsers(process.env.AUTH_USERS).find((user) => user.email === needle);
  if (envHit) {
    throw new Error("Los usuarios definidos en AUTH_USERS no se pueden eliminar desde la app");
  }
  const stored = await loadStoredUsers();
  const next = stored.filter((user) => user.email !== needle);
  if (next.length === stored.length) {
    throw new Error("Usuario no encontrado");
  }
  await saveStoredUsers(next);
}

export function publicUser(user: AuthUser) {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    campus: user.campus,
    source: user.source,
    schedule: user.schedule,
  };
}
