import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { can } from "@/server/context";
import { listPortalInbox } from "@/server/services/portal-plus.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Mensagens do portal" };

export default async function PortalInboxPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "clients:read")) return <AccessDenied />;
  const rows = await listPortalInbox(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mensagens do portal" description="Conversas dos clientes com a equipe pelo portal. Os andamentos em linguagem simples ficam na aba “Portal do cliente” de cada processo." />
      <Card>
        {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhuma mensagem ainda.</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.clientId} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <Link href={`/portal-equipe/${r.clientId}`} className="font-medium hover:underline">{r.name}</Link>
              <span className="flex items-center gap-2 text-xs text-muted">{r.last.toLocaleString("pt-BR")}{r.unread ? <Badge tone="warning">{r.unread} nova(s)</Badge> : null}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
