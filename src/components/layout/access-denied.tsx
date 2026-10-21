import { ShieldAlert } from "lucide-react";

export function AccessDenied({ detail }: { detail?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-surface p-8 text-center">
      <ShieldAlert className="mx-auto h-8 w-8 text-warning" aria-hidden />
      <h1 className="mt-3 text-base font-semibold">Acesso negado</h1>
      <p className="mt-1 text-sm text-muted">{detail ?? "Seu perfil não possui permissão para ver esta página. Fale com o administrador do escritório."}</p>
    </div>
  );
}
