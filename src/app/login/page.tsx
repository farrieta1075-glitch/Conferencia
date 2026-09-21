"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("admin@auditorio.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("error") ? "Credenciales incorrectas" : "");
  const [busy, setBusy] = useState(false);
  const callbackUrl = params.get("callbackUrl") || "/";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });
    if (result?.error) {
      setError("Correo o contraseña incorrectos.");
      setBusy(false);
      return;
    }
    window.location.href = callbackUrl;
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-md p-6">
      <p className="text-xs uppercase tracking-wider text-bronze-dark">Acceso</p>
      <h1 className="font-display text-3xl text-ink">Boletos Auditorio Nacional</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Inicia sesión con el rol que te asignaron: administrador, editor, práctica o consulta.
      </p>
      <label className="mt-5 block text-sm font-medium text-ink-muted">
        Correo
        <input
          className="field mt-1"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="mt-3 block text-sm font-medium text-ink-muted">
        Contraseña
        <input
          className="field mt-1"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && <p className="mt-3 text-sm text-sold">{error}</p>}
      <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy p-4">
      <Suspense fallback={<div className="card h-64 w-full max-w-md" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
