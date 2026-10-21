import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { formatDateTime } from "@/lib/dates/format";
import { UserControls } from "@/modules/platform/admin-controls";
import { requirePlatform } from "@/server/platform";
import { listPlatformUsers } from "@/server/services/platform.service";

export const metadata: Metadata = { title: "Administração — usuários" };
export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { pc } = await requirePlatform();
  const sp = await searchParams;
  const r = await listPlatformUsers(pc, { q: sp.q });
  return (
    <div>
      <PageHeader title="Usuários" description="Desativar encerra todas as sessões do usuário em todos os escritórios. Super-administradores só são alterados pelo script de administração." />
      <form method="get" className="mb-4 flex gap-2" role="search" aria-label="Buscar usuários">
        <label htmlFor="q" className="sr-only">Buscar</label>
        <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Nome ou e-mail" className="w-72" />
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Buscar</button>
      </form>
      {r.total > r.items.length ? <p className="mb-2 text-xs text-warning">Mostrando {r.items.length} de {r.total}.</p> : null}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Usuários</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="px-4 py-2 font-medium">Usuário</th>
              <th scope="col" className="px-3 py-2 font-medium">Escritórios</th>
              <th scope="col" className="px-3 py-2 font-medium">Segurança</th>
              <th scope="col" className="px-3 py-2 font-medium">Último login</th>
              <th scope="col" className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((u) => (
              <tr key={u.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted">{u.email}</p>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {u.organizations.length === 0 ? <span className="text-muted">—</span> : u.organizations.map((o) => (
                    <p key={o.id}>{o.name} <span className="text-muted">({o.role})</span>{o.suspended ? <Badge tone="danger" className="ml-1">suspenso</Badge> : null}</p>
                  ))}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.mfa ? <Badge tone="success">2FA</Badge> : <Badge tone="warning">Sem 2FA</Badge>}
                    {u.disabledAt ? <Badge tone="danger">Desativado</Badge> : null}
                    {u.locked ? <Badge tone="warning">Bloqueado</Badge> : null}
                    {u.isPlatformAdmin ? <Badge tone="info">Super-admin</Badge> : null}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Nunca"}</td>
                <td className="px-3 py-2.5"><UserControls userId={u.id} disabled={Boolean(u.disabledAt)} locked={u.locked} protectedUser={u.isPlatformAdmin || u.id === pc.userId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
