"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ROLES, roleLabel, type Role } from "@/lib/auth/roles";
import {
  WEEKDAYS,
  mexicoParts,
  parseSchedule,
  scheduleLabel,
  windowsFor,
  type DayWindow,
  type EditorSchedule,
  type WeekdayId,
} from "@/lib/auth/schedule";
import { CAMPUSES, campusLabel, type Campus } from "@/lib/campus";
import { apiFetch } from "@/lib/api/client";
import { useCampus } from "@/context/CampusContext";

interface PublicUser {
  email: string;
  name: string;
  role: Role;
  campus: Campus;
  source: "env" | "file";
  schedule?: EditorSchedule;
}

export default function UsuariosAdminPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const { userCampus } = useCampus();
  const [role, setRole] = useState<Role>("EDITOR");
  const [campus, setCampus] = useState<Campus>("QRO");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterCampus, setFilterCampus] = useState<Campus | "">("");
  const [filterRole, setFilterRole] = useState<Role | "">("");
  const [scheduleUser, setScheduleUser] = useState<PublicUser | null>(null);

  const filtered = useMemo(() => {
    const needle = filterName.trim().toLowerCase();
    return users.filter((user) => {
      if (needle && !`${user.name} ${user.email}`.toLowerCase().includes(needle)) return false;
      if (filterCampus && user.campus !== filterCampus) return false;
      if (filterRole && user.role !== filterRole) return false;
      return true;
    });
  }, [filterCampus, filterName, filterRole, users]);

  async function load() {
    const data = await apiFetch<{ users: PublicUser[] }>("/api/users");
    setUsers(data.users);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar usuarios"));
  }, []);

  function resetForm() {
    setEmail("");
    setName("");
    setPassword("");
    setRole("EDITOR");
    setCampus("QRO");
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, name, password, role, campus }),
      });
      resetForm();
      setOpenCreate(false);
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

  const campusOptions = CAMPUSES.filter((item) => userCampus === "ALL" || item !== "ALL");

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-3xl phone-landscape:text-xl">Usuarios y roles</h2>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setError("");
              setOpenCreate(true);
            }}
          >
            Crear usuario
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-ink-muted">
            Nombre
            <input
              className="field mt-1"
              placeholder="Nombre o correo"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-ink-muted">
            Campus
            <select
              className="field mt-1"
              value={filterCampus}
              onChange={(e) => setFilterCampus(e.target.value as Campus | "")}
            >
              <option value="">Todos</option>
              {campusOptions.map((item) => (
                <option key={item} value={item}>
                  {campusLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-ink-muted">
            Rol
            <select
              className="field mt-1"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as Role | "")}
            >
              <option value="">Todos</option>
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {roleLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="card overflow-x-auto p-5">
        {error && !openCreate ? <p className="mb-3 text-sm text-sold">{error}</p> : null}
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="text-ink-muted">
              <th className="pb-2">Correo</th>
              <th className="pb-2">Rol</th>
              <th className="pb-2">Campus</th>
              <th className="pb-2">Origen</th>
              <th className="pb-2">Horario</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.email} className="border-t border-slate-200">
                <td className="py-2">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-ink-muted">{user.email}</div>
                </td>
                <td>{roleLabel(user.role)}</td>
                <td>{campusLabel(user.campus)}</td>
                <td>{user.source === "env" ? "Inicial" : "App"}</td>
                <td>
                  {user.role === "EDITOR" ? (
                    <button
                      type="button"
                      className="btn-ghost px-3 text-left"
                      onClick={() => setScheduleUser(user)}
                    >
                      {scheduleLabel(user.schedule)}
                    </button>
                  ) : user.role === "PRACTICE" ? (
                    <span className="text-xs text-ink-muted">Sin restricción</span>
                  ) : (
                    "—"
                  )}
                </td>
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
            {!filtered.length ? (
              <tr>
                <td colSpan={6} className="py-3 text-ink-muted">
                  No hay usuarios con ese filtro.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {openCreate
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/70 p-3 sm:items-center"
              onClick={() => setOpenCreate(false)}
            >
              <form
                className="card max-h-[92dvh] w-full max-w-lg overflow-y-auto p-5"
                onClick={(event) => event.stopPropagation()}
                onSubmit={(event) => void onCreate(event)}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-display text-2xl">Crear usuario</h3>
                  <button type="button" className="btn-ghost" onClick={() => setOpenCreate(false)}>
                    Cerrar
                  </button>
                </div>
                <div className="grid gap-3">
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
                  <label className="text-sm font-medium text-ink-muted">
                    Campus
                    <select
                      className="field mt-1"
                      value={campus}
                      onChange={(e) => setCampus(e.target.value as Campus)}
                    >
                      {campusOptions.map((item) => (
                        <option key={item} value={item}>
                          {campusLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="btn-primary w-fit" disabled={busy}>
                    {busy ? "Creando…" : "Crear usuario"}
                  </button>
                  {error ? <p className="text-sm text-sold">{error}</p> : null}
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}

      {scheduleUser
        ? createPortal(
            <EditorScheduleModal
              user={scheduleUser}
              busy={busy}
              error={error}
              onClose={() => {
                setScheduleUser(null);
                setError("");
              }}
              onSave={async (schedule) => {
                setBusy(true);
                setError("");
                try {
                  await apiFetch(`/api/users/${encodeURIComponent(scheduleUser.email)}`, {
                    method: "PATCH",
                    body: JSON.stringify({ schedule }),
                  });
                  setScheduleUser(null);
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "No se pudo guardar el horario");
                } finally {
                  setBusy(false);
                }
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function EditorScheduleModal({
  user,
  busy,
  error,
  onClose,
  onSave,
}: {
  user: PublicUser;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (schedule: EditorSchedule | null) => Promise<void>;
}) {
  const today = mexicoParts().date;
  const initial = user.schedule;
  const initialWindows = windowsFor(initial);
  const [mode, setMode] = useState<"once" | "weekly">(initial?.mode ?? "once");
  const [start, setStart] = useState(initial?.start ?? initialWindows[0]?.start ?? "09:30");
  const [end, setEnd] = useState(initial?.end ?? initialWindows[0]?.end ?? "09:50");
  const [windows, setWindows] = useState<DayWindow[]>(initialWindows);
  const [formError, setFormError] = useState("");

  function toggleDay(id: WeekdayId) {
    setWindows((current) => {
      if (current.some((item) => item.day === id)) {
        return current.filter((item) => item.day !== id);
      }
      return [...current, { day: id, start, end }].sort((a, b) => a.day - b.day);
    });
  }

  function updateWindow(id: WeekdayId, field: "start" | "end", value: string) {
    setWindows((current) =>
      current.map((item) => (item.day === id ? { ...item, [field]: value } : item)),
    );
  }

  function applyToSelected() {
    setWindows((current) => current.map((item) => ({ ...item, start, end })));
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/70 p-3 sm:items-center" onClick={onClose}>
      <form
        className="card max-h-[92dvh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          setFormError("");
          const payload =
            mode === "once"
              ? { mode: "once" as const, date: today, start, end }
              : { mode: "weekly" as const, windows };
          const parsed = parseSchedule(payload);
          if (!parsed) {
            setFormError(
              mode === "weekly"
                ? "Marca al menos un día y revisa que cada horario tenga hora de fin posterior al inicio."
                : "Revisa que la hora de fin sea posterior al inicio.",
            );
            return;
          }
          void onSave(parsed);
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-2xl">Horario de acceso</h3>
            <p className="text-sm text-ink-muted">
              {user.name} · {user.email}
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="mb-3 text-sm text-ink-muted">
          El editor solo puede entrar en la ventana que indiques (hora de Ciudad de México). Al terminar se
          cierra la sesión y no podrá volver a entrar hasta el siguiente horario permitido.
        </p>
        <div className="grid gap-3">
          <label className="text-sm font-medium text-ink-muted">
            Tipo
            <select className="field mt-1" value={mode} onChange={(event) => setMode(event.target.value as "once" | "weekly")}>
              <option value="once">Solo hoy</option>
              <option value="weekly">Días de la semana</option>
            </select>
          </label>
          {mode === "weekly" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-ink-muted">
                  Horario a copiar
                  <input className="field mt-1" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
                </label>
                <label className="text-sm font-medium text-ink-muted">
                  Hasta
                  <input className="field mt-1" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
                </label>
              </div>
              <button type="button" className="btn-ghost w-fit" onClick={applyToSelected}>
                Usar el mismo horario en los días marcados
              </button>
              <fieldset>
                <legend className="text-sm font-medium text-ink-muted">Días permitidos</legend>
                <div className="mt-2 grid gap-2">
                  {WEEKDAYS.map((day) => {
                    const window = windows.find((item) => item.day === day.id);
                    return (
                      <div key={day.id} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
                        <label className="flex min-w-28 items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={Boolean(window)} onChange={() => toggleDay(day.id)} />
                          {day.label}
                        </label>
                        <input
                          className="field"
                          type="time"
                          disabled={!window}
                          value={window?.start ?? ""}
                          onChange={(event) => updateWindow(day.id, "start", event.target.value)}
                        />
                        <input
                          className="field"
                          type="time"
                          disabled={!window}
                          value={window?.end ?? ""}
                          onChange={(event) => updateWindow(day.id, "end", event.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">Válido únicamente el {today}.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-ink-muted">
                  Desde
                  <input
                    className="field mt-1"
                    type="time"
                    required
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </label>
                <label className="text-sm font-medium text-ink-muted">
                  Hasta
                  <input
                    className="field mt-1"
                    type="time"
                    required
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar horario"}
            </button>
            {user.schedule ? (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => void onSave(null)}>
                Quitar horario
              </button>
            ) : null}
          </div>
          {formError || error ? <p className="text-sm text-sold">{formError || error}</p> : null}
        </div>
      </form>
    </div>
  );
}
