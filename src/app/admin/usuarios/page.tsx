"use client";

import { FormEvent, useEffect, useState } from "react";
import { ROLES, roleLabel, type Role } from "@/lib/auth/roles";
import { apiFetch } from "@/lib/api/client";

interface PublicUser {
  email: string;
  name: string;
  role: Role;
  source: "env" | "file";
}

export default function UsuariosAdminPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await apiFetch<{ users: PublicUser[] }>("/api/users");
    setUsers(data.users);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar usuarios"));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, name, password, role }),
      });
      setEmail("");
      setName("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(user: PublicUser) {
    if (user.source === "env") return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/users/${encodeURIComponent(user.email)}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="text-xs uppercase tracking-wider text-bronze-dark">ADMIN</p>
        <h2 className="font-display text-3xl">Usuarios y roles</h2>
        <p className="mt-2 text-sm text-ink-muted">
          ADMIN gestiona cuentas. EDITOR no puede entrar aquí. VIEWER solo consulta mapas.
        </p>
      </section>
      <form className="card grid gap-3 p-5" onSubmit={onCreate}>
        <h3 className="font-display text-2xl">Alta de usuario</h3>
        <label className="text-sm font-medium text-ink-muted">
          Nombre
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm font-medium text-ink-muted">
          Correo
          <input
            className="field mt-1"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-ink-muted">
          Contraseña
          <input
            className="field mt-1"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-ink-muted">
          Rol
          <select
            className="field mt-1"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {roleLabel(item)} ({item})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary w-fit" disabled={busy}>
          Crear usuario
        </button>
        {error && <p className="text-sm text-sold">{error}</p>}
      </form>
      <section className="card overflow-x-auto p-5">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="text-ink-muted">
              <th className="pb-2">Correo</th>
              <th className="pb-2">Rol</th>
              <th className="pb-2">Origen</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.email} className="border-t border-slate-200">
                <td className="py-2">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-ink-muted">{user.email}</div>
                </td>
                <td>{roleLabel(user.role)}</td>
                <td>{user.source === "env" ? "Inicial" : "App"}</td>
                <td>
                  {user.source === "file" ? (
                    <button
                      type="button"
                      className="btn-ghost px-3"
                      disabled={busy}
                      onClick={() => void onDelete(user)}
                    >
                      Eliminar
                    </button>
                  ) : (
                    <span className="text-xs text-ink-muted">Definido en .env.local</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
