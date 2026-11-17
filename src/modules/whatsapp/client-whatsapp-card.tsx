import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatWaId } from "@/lib/whatsapp/phone";
import { can, type TenantContext } from "@/server/context";
import { conversationsOfClient, conversationsOfLead } from "@/server/services/chat-links.service";
import { listQuickReplies, listTemplatesLocal } from "@/server/services/whatsapp-account.service";
import { findContactWhatsapp, openConversation } from "@/server/services/whatsapp.service";
import { AutoRefresh } from "./auto-refresh";
import { ChatPane } from "./chat-pane";
import { ConversationsCard } from "./conversations-card";
import { StartClientWhatsapp } from "./start-client-whatsapp";

export async function ClientWhatsappCard({ ctx, client, leadId }: {
  ctx: TenantContext;
  leadId?: string;
  client: { id: string | null; name: string; phone: string | null };
}) {
  if (!can(ctx, "whatsapp:read") || !can(ctx, leadId ? "crm:read" : "clients:read") || (client.id && !can(ctx, "clients:read"))) return null;

  const { waId, account, conversation, blocked } = await findContactWhatsapp(ctx, { clientId: client.id, leadId: leadId ?? null }, client.phone);
  const contact = leadId ? { leadId } : client.id ? { clientId: client.id } : null;
  const needsLink = conversation && (leadId ? conversation.leadId !== leadId || conversation.clientId !== client.id : !conversation.clientId);
  const canWrite = !!account?.enabled && can(ctx, "whatsapp:write");
  const sender = account?.displayPhone ?? account?.label;
  const description = sender ? `WhatsApp do escritório · ${sender}` : "WhatsApp do escritório";
  const [opened, linked] = await Promise.all([
    conversation ? openConversation(ctx, conversation.id) : null,
    leadId ? conversationsOfLead(ctx, leadId) : client.id ? conversationsOfClient(ctx, client.id) : [],
  ]);
  const [quick, templates] = opened && canWrite
    ? await Promise.all([
        listQuickReplies(ctx),
        opened.conversation.windowOpen ? [] : listTemplatesLocal(ctx),
      ])
    : [[], []];

  return (
    <>
      <Card className="min-w-0 overflow-hidden" data-testid="client-whatsapp">
        <CardHeader title="Falar com o cliente" description={description} />
        {waId && account?.enabled && !blocked ? <AutoRefresh /> : null}
        {opened ? (
          <>
            {account && !account.enabled ? (
              <p className="border-b border-border px-5 py-2 text-sm text-muted">O WhatsApp do escritório está desligado.</p>
            ) : null}
            {canWrite && contact && needsLink ? (
              <CardBody><StartClientWhatsapp contact={contact} label="Vincular conversa ao cadastro" /></CardBody>
            ) : null}
            <div className="h-[32rem]">
              <ChatPane
                key={opened.conversation.id}
                historyCursor={opened.historyCursor}
                embedded
                chat={{
                  id: opened.conversation.id,
                  profilePhoto: opened.conversation.account.provider === "QR",
                  title: client.name,
                  phone: formatWaId(opened.conversation.waId),
                  client: opened.conversation.client,
                  status: opened.conversation.status,
                  case: null,
                  lead: null,
                  can: { cases: false, tasks: false, events: false, deadlines: false, leads: false, documents: opened.conversation.client?.id === client.id && can(ctx, "documents:write") },
                  assignedToId: null,
                  queueId: null,
                  windowOpen: opened.conversation.windowOpen,
                  windowClosesAt: opened.conversation.windowClosesAt?.toISOString() ?? null,
                  canWrite,
                  canLinkClient: false,
                  me: ctx.userId,
                }}
                messages={opened.messages.filter((m) => m.direction === "IN" || m.direction === "OUT").map(({ direction, author, createdAt, ...m }) => ({
                  ...m,
                  direction: direction === "IN" ? "IN" : "OUT",
                  authorName: author?.name ?? null,
                  createdAt: createdAt.toISOString(),
                }))}
                team={[]}
                quick={quick}
                templates={templates.map(({ id, name, language, body, variableCount }) => ({ id, name, language, body, variableCount }))}
              />
            </div>
          </>
        ) : (
          <CardBody className="space-y-3 text-sm">
            {waId ? <p className="font-medium">{formatWaId(waId)}</p> : null}
            {!waId ? (
              <p className="text-muted">
                Cadastre um número de WhatsApp válido para conversar com o cliente.
                {client.id && can(ctx, "clients:write") ? <> <Link className="underline" href={`/clientes/${client.id}/editar`}>Editar cadastro</Link></> : null}
              </p>
            ) : blocked ? (
              <p className="text-muted">O número está vinculado à conversa de outro cliente.</p>
            ) : !account?.enabled ? (
              <p className="text-muted">
                Conecte o WhatsApp principal do escritório para conversar por aqui.
                {can(ctx, "whatsapp:manage") ? <> <Link className="underline" href="/atendimento/configuracoes">Configurar WhatsApp</Link></> : null}
              </p>
            ) : (
              <>
                <p className="text-muted">Ainda não há mensagens com este número.</p>
                {canWrite && contact ? <StartClientWhatsapp contact={contact} /> : null}
              </>
            )}
          </CardBody>
        )}
      </Card>
      <ConversationsCard rows={linked.filter((row) => row.id !== opened?.conversation.id)} title="Outras conversas de WhatsApp" />
    </>
  );
}
