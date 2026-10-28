import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { formatPhone } from "@/lib/format/phone";
import { uuidSchema } from "@/lib/validation/common";
import { formatMoneyBR } from "@/lib/validation/money";
import { ActivityForm, ConvertForm, DeleteLeadButton, LostForm, ReopenButton, StageSelect } from "@/modules/crm/lead-controls";
import { ProposalControls } from "@/modules/crm/proposal-controls";
import { ACTIVITY_LABEL, LEAD_STAGE_LABEL, LEAD_STAGE_TONE, PROPOSAL_STATUS_LABEL, type LeadStageKey, type ProposalStatusKey } from "@/modules/crm/schemas";
import { can } from "@/server/context";
import { getLead } from "@/server/services/crm.service";
import { ConversationsCard } from "@/modules/whatsapp/conversations-card";
import { conversationsOfLead } from "@/server/services/chat-links.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "crm:read")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getLead(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!data) notFound();
  const { lead: l, names } = data;
  const tz = organization.timezone;
  const stage = l.stage as LeadStageKey;
  const open = stage !== "WON" && stage !== "LOST";
  const canWrite = can(ctx, "crm:write");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={l.name}
        description={l.interest ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={LEAD_STAGE_TONE[stage]}>{LEAD_STAGE_LABEL[stage]}</Badge>
            {canWrite && open ? <Link href={`/crm/${l.id}/editar`} className={bv({ variant: "secondary" })}><Pencil className="h-4 w-4" aria-hidden /> Editar</Link> : null}
          </div>
        }
      />
      {stage === "WON" && l.clientId ? (
        <Alert tone="success" className="mb-4">Convertido em cliente. <Link href={`/clientes/${l.clientId}`} className="underline">Abrir ficha do cliente</Link>{can(ctx, "cases:write") ? <> · <Link href={`/processos/novo?cliente=${l.clientId}`} className="underline">Abrir um caso para este cliente</Link></> : null}</Alert>
      ) : null}
      {stage === "LOST" ? <Alert tone="warning" className="mb-4">Perdido: {l.lostReason}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Dados" />
            <CardBody className="grid gap-2 text-sm md:grid-cols-2">
              <p><span className="text-muted">E-mail:</span> {l.email ?? "—"}</p>
              <p><span className="text-muted">Telefone:</span> {l.phone ? formatPhone(l.phone) : "—"}</p>
              <p><span className="text-muted">Origem:</span> {l.source ?? "—"}</p>
              <p><span className="text-muted">Valor estimado:</span> {l.estimatedValue ? formatMoneyBR(l.estimatedValue.toString()) : "—"}</p>
              <p><span className="text-muted">Responsável:</span> {l.ownerId ? (names.get(l.ownerId) ?? "ex-membro") : "—"}</p>
              <p><span className="text-muted">Próximo contato:</span> {l.nextActionDate ? formatYmd(dateToYmd(l.nextActionDate)) : "—"}</p>
              {l.notes ? <p className="md:col-span-2 whitespace-pre-wrap">{l.notes}</p> : null}
            </CardBody>
          </Card>

          <ConversationsCard rows={await conversationsOfLead(ctx, l.id)} />

          <Card>
            <CardHeader
              title="Propostas"
              action={canWrite && open ? <Link href={`/crm/${l.id}/propostas/nova`} className={bv({ variant: "secondary", size: "sm" })}>Nova proposta</Link> : undefined}
            />
            <ul className="divide-y divide-border">
              {l.proposals.length === 0 ? <li className="px-4 py-3 text-sm text-muted">Nenhuma proposta.</li> : null}
              {l.proposals.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{p.title} <Badge>{PROPOSAL_STATUS_LABEL[p.status as ProposalStatusKey]}</Badge></p>
                    <p className="text-xs text-muted">{formatMoneyBR(p.amount.toString())}{p.validUntil ? ` · válida até ${formatYmd(dateToYmd(p.validUntil))}` : ""}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    {canWrite && p.status === "DRAFT" ? <Link href={`/crm/${l.id}/propostas/${p.id}`} className={bv({ variant: "ghost", size: "sm" })}>Editar</Link> : null}
                    {canWrite ? <ProposalControls id={p.id} status={p.status} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Histórico de contatos" />
            <CardBody className="space-y-4">
              {canWrite && open ? <ActivityForm leadId={l.id} /> : null}
              <ul className="space-y-3">
                {l.activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-border pl-3 text-sm">
                    <p className="text-xs text-muted">{ACTIVITY_LABEL[a.kind] ?? a.kind} · {formatDateTime(a.createdAt, tz)}{a.createdById ? ` · ${names.get(a.createdById) ?? "ex-membro"}` : ""}</p>
                    <p className="whitespace-pre-wrap">{a.body}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        {canWrite ? (
          <div className="space-y-4">
            {open ? (
              <>
                <Card>
                  <CardHeader title="Etapa" />
                  <CardBody><StageSelect leadId={l.id} stage={l.stage} /></CardBody>
                </Card>
                {can(ctx, "clients:write") ? (
                  <Card><CardBody><ConvertForm leadId={l.id} type={l.type} /></CardBody></Card>
                ) : null}
                <Card><CardBody><LostForm leadId={l.id} /></CardBody></Card>
              </>
            ) : null}
            {stage === "LOST" ? <ReopenButton leadId={l.id} /> : null}
            {!l.clientId ? <DeleteLeadButton leadId={l.id} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
