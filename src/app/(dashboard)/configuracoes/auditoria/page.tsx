import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { can } from "@/server/context";
import { listAuditLogs } from "@/server/services/dashboard.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Auditoria" };
const PAGE_SIZE = 25;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "audit:read")) return <AccessDenied />;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const action = sp.action?.slice(0, 40);
  const { total, rows } = await listAuditLogs(ctx, { page, pageSize: PAGE_SIZE, action });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => `?page=${p}${action ? `&action=${encodeURIComponent(action)}` : ""}`;

  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-2" role="search">
        <div>
          <label htmlFor="action" className="mb-1 block text-xs text-muted">
            Filtrar por ação (prefixo)
          </label>
          <input
            id="action"
            name="action"
            defaultValue={action}
            placeholder="ex.: member, invitation, auth"
            className="h-9 w-64 rounded-md border border-border bg-surface-2 px-3 text-sm focus:border-primary"
          />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Filtrar
        </button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Quando</th>
                <th className="px-4 py-2 font-medium">Usuário</th>
                <th className="px-4 py-2 font-medium">Ação</th>
                <th className="px-4 py-2 font-medium">Recurso</th>
                <th className="px-4 py-2 font-medium">Resultado</th>
                <th className="px-4 py-2 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{formatDateTime(r.createdAt, organization.timezone)}</td>
                  <td className="px-4 py-2">{r.user?.name ?? <span className="text-muted">Sistema</span>}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-2 text-xs text-muted">{r.resourceType ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={r.result === "SUCCESS" ? "success" : r.result === "DENIED" ? "warning" : "danger"}>{r.result}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{r.ipAddress ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    Nenhum evento encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {total} evento(s) · página {page} de {pages}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={qs(page - 1)}>
              Anterior
            </Link>
          ) : null}
          {page < pages ? (
            <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={qs(page + 1)}>
              Próxima
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
