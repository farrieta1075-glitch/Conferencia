import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="card mx-auto max-w-lg p-6">
      <p className="text-xs uppercase tracking-wider text-sold">403 Forbidden</p>
      <h1 className="font-display text-3xl">No tienes permiso para esta sección</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Tu rol no puede crear, editar o eliminar este recurso. Si necesitas acceso, pide a un
        administrador que te asigne EDITOR o ADMIN.
      </p>
      <Link href="/" className="btn-primary mt-5 inline-flex">
        Volver al mapa
      </Link>
    </div>
  );
}
