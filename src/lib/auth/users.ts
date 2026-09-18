import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseRole, type Role } from "@/lib/auth/roles";

export interface AuthUser {
  email: string;
  name: string;
  role: Role;
  password?: string;
  passwordHash?: string;
  source: "env" | "file";
}

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

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
      const [email, password, roleRaw] = entry.split(":");
      const role = parseRole(roleRaw);
      if (!email || !password || !role) return [];
      return [
        {
          email: email.trim().toLowerCase(),
          name: email.trim(),
          role,
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
          passwordHash: user.passwordHash,
          source: "file" as const,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function listUsers(): Promise<AuthUser[]> {
  const map = new Map<string, AuthUser>();
  for (const user of parseEnvUsers(process.env.AUTH_USERS)) map.set(user.email, user);
  for (const user of await readFileUsers()) map.set(user.email, user);
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
  return { email: user.email, name: user.name, role: user.role, source: user.source };
}

export async function createUser(input: {
  email: string;
  name?: string;
  password: string;
  role: Role;
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
    passwordHash: hashPassword(input.password),
    source: "file",
  };
  const fileUsers = await readFileUsers();
  await mkdir(path.dirname(USERS_FILE), { recursive: true });
  await writeFile(USERS_FILE, JSON.stringify([...fileUsers, next], null, 2), "utf8");
  return next;
}

export async function deleteUser(email: string): Promise<void> {
  const needle = email.trim().toLowerCase();
  const envHit = parseEnvUsers(process.env.AUTH_USERS).find((user) => user.email === needle);
  if (envHit) {
    throw new Error("Los usuarios definidos en AUTH_USERS no se pueden eliminar desde la app");
  }
  const fileUsers = await readFileUsers();
  const next = fileUsers.filter((user) => user.email !== needle);
  if (next.length === fileUsers.length) {
    throw new Error("Usuario no encontrado");
  }
  await mkdir(path.dirname(USERS_FILE), { recursive: true });
  await writeFile(USERS_FILE, JSON.stringify(next, null, 2), "utf8");
}

export function publicUser(user: AuthUser) {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    source: user.source,
  };
}
