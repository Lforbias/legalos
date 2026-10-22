import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { uuidSchema } from "@/lib/validation/common";
import { ReplyForm } from "@/modules/portal/plus-ui";
import { can } from "@/server/context";
import { listMessagesForClient } from "@/server/services/portal-plus.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Conversa do portal" };

export default async function PortalChatPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "clients:read")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).clientId);
  if (!id.success) notFound();
  const client = await db.client.findFirst({ where: { id: id.data, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true } });
  if (!client) notFound();
  const msgs = await listMessagesForClient(ctx, client.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={client.name} description="Conversa pelo portal do cliente." actions={<Link className="text-sm underline" href={`/clientes/${client.id}?aba=portal`}>Ficha do cliente</Link>} />
      <Card><CardBody className="space-y-3">
        {msgs.length === 0 ? <p className="text-sm text-muted">Sem mensagens.</p> : null}
        {msgs.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.fromClient ? "bg-surface-2" : "ml-auto bg-primary/10"}`}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-[11px] text-muted">{m.fromClient ? "Cliente" : "Equipe"} · {m.createdAt.toLocaleString("pt-BR")}</p>
          </div>
        ))}
        {can(ctx, "clients:write") ? <ReplyForm clientId={client.id} /> : null}
      </CardBody></Card>
    </div>
  );
}
