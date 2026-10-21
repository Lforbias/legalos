import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Lock, Pencil, PenLine, Server } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TabsNav } from "@/components/ui/tabs-nav";
import { formatDate, formatDateTime } from "@/lib/dates/format";
import { NotFoundError } from "@/lib/permissions/check";
import { formatCnj, CNJ_SEGMENTS, parseCnj } from "@/lib/validation/br-documents";
import { uuidSchema } from "@/lib/validation/common";
import { formatMoneyBR } from "@/lib/validation/money";
import { ArchiveCaseButton, MembersPanel, NoteForm, PartiesPanel, StatusControl } from "@/modules/cases/case-panels";
import { CASE_STATUS_LABEL, EVENT_KIND_LABEL } from "@/modules/cases/schemas";
import { deadlineDue, DUE_BADGE, dueText, STATUS_TONE } from "@/modules/deadlines/tone";
import { DEADLINE_STATUS_LABEL } from "@/modules/deadlines/schemas";
import { TASK_STATUS_LABEL } from "@/modules/tasks/schemas";
import { listDeadlinesForCase } from "@/server/services/deadline.service";
import { CaseShareToggle } from "@/modules/portal/share-toggle";
import { listPetitions } from "@/server/services/petition.service";
import { PETITION_STATUS_LABEL, PETITION_STATUS_TONE, type PetitionStatusKey } from "@/modules/petitions/schemas";
import { NOTICE_KIND_LABEL, NOTICE_STATUS_LABEL } from "@/modules/inbox/schemas";
import { listNotices } from "@/server/services/notice.service";
import { listTasksForCase } from "@/server/services/task.service";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { AcervoButton, CaseNotesPanel, CustomValuesCard } from "@/modules/cases/extras-ui";
import { listCaseNotes } from "@/server/services/case-note.service";
import { listCustomFields } from "@/server/services/custom-field.service";
import { DocumentsPanel } from "@/modules/documents/documents-panel";
import { can } from "@/server/context";
import { MniAutosButton, MniConsultButton } from "@/modules/mni/mni-ui";
import { connectionForCase } from "@/server/services/mni.service";
import { DatajudSyncButton } from "@/modules/cases/datajud-button";
import { datajudStatus } from "@/server/services/datajud.service";
import { getCase, listAssignableMembers, listCaseEvents } from "@/server/services/case.service";
import { listDocuments } from "@/server/services/document.service";
import { ConversationsCard } from "@/modules/whatsapp/conversations-card";
import { SendClientCard } from "@/modules/whatsapp/send-client-card";
import { caseMessageTargets } from "@/server/services/chat-send.service";
import { conversationsOfCase } from "@/server/services/chat-links.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Processo" };

const TONE = { ACTIVE: "success", SUSPENDED: "warning", ARCHIVED: "neutral", CLOSED: "neutral" } as const;

const SOURCE = {
  IMPORTED: { label: "Importado do tribunal", tone: "info" as const, Icon: Server },
  INTERNAL: { label: "Registro interno", tone: "accent" as const, Icon: PenLine },
  AUTOMATIC: { label: "Automático do sistema", tone: "neutral" as const, Icon: Bot },
};

/** Anotações com data informada são gravadas ao meio-dia UTC (sem hora); nesse caso exibimos apenas a data. */
function isDateOnly(d: Date) {
  return d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; fonte?: string }>;
}) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const c = await getCase(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!c) notFound();

  const canWrite = can(ctx, "cases:write");
  const dj = canWrite && c.number && !c.confidential ? await datajudStatus(ctx) : null;
  const showDatajud = Boolean(dj?.keyConfigured && dj.orgEnabled);
  const mni = canWrite && c.number && !c.confidential ? await connectionForCase(ctx, c.id).catch(() => null) : null;
  const canDocs = can(ctx, "documents:read");
  const canDeadlines = can(ctx, "deadlines:read");
  const canTasks = can(ctx, "tasks:read");
  const canNotices = can(ctx, "inbox:read");
  const canPetitions = can(ctx, "petitions:read");
  const tabs = [
    { key: "resumo", label: "Resumo" },
    { key: "partes", label: "Partes", count: c.parties.length },
    { key: "notas", label: "Notas" },
    { key: "andamentos", label: "Linha do tempo" },
    ...(canDeadlines ? [{ key: "prazos", label: "Prazos" }] : []),
    ...(canTasks ? [{ key: "tarefas", label: "Tarefas" }] : []),
    ...(canNotices ? [{ key: "intimacoes", label: "Intimações" }] : []),
    ...(canDocs ? [{ key: "documentos", label: "Documentos" }] : []),
    ...(canPetitions ? [{ key: "peticoes", label: "Petições" }] : []),
    { key: "equipe", label: "Equipe", count: c.members.length },
  ];
  const sp = await searchParams;
  const tab = tabs.some((t) => t.key === sp.aba) ? (sp.aba as string) : "resumo";
  const tz = organization.timezone;
  const cnj = c.number ? parseCnj(c.number) : null;
  const caseDeadlines = tab === "prazos" && canDeadlines ? await listDeadlinesForCase(ctx, c.id) : null;
  const caseNotices = tab === "intimacoes" && canNotices ? await listNotices(ctx, { caseId: c.id, status: undefined }).then(async (open) => ({ items: [...open.items, ...(await listNotices(ctx, { caseId: c.id, status: "PROCESSED" })).items] })) : null;
  const caseTasks = tab === "tarefas" && canTasks ? await listTasksForCase(ctx, c.id) : null;
  const casePetitions = tab === "peticoes" && canPetitions ? await listPetitions(ctx, { caseId: c.id }) : null;
  const caseNotes = tab === "notas" ? await listCaseNotes(ctx, c.id) : null;
  const customDefs = tab === "resumo" ? await listCustomFields(ctx) : [];
  const responsible = c.members.find((m) => m.role === "RESPONSIBLE");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={c.title}
        description={c.number ? `Nº ${formatCnj(c.number)}` : c.legacyNumber ? `Nº ${c.legacyNumber}` : "Processo sem número"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {c.confidential ? (
              <Badge tone="warning">
                <Lock className="mr-1 h-3 w-3" aria-hidden /> Sigiloso
              </Badge>
            ) : null}
            <Badge tone={TONE[c.status]}>{CASE_STATUS_LABEL[c.status]}</Badge>
            {c.archivedAt ? <Badge>Acervo</Badge> : null}
            {can(ctx, "ai:use") ? (
              <Link href={`/ia?processo=${c.id}`} className={buttonVariants({ variant: "secondary" })}>
                <Bot className="h-4 w-4" aria-hidden /> Perguntar à IA
              </Link>
            ) : null}
            {showDatajud ? <DatajudSyncButton caseId={c.id} /> : null}
            {mni ? <MniConsultButton caseId={c.id} label={mni.label} /> : null}
            {mni && can(ctx, "documents:write") ? <MniAutosButton caseId={c.id} label={mni.label} /> : null}
            {canWrite ? (
              <Link href={`/processos/${c.id}/editar`} className={buttonVariants({ variant: "secondary" })}>
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </Link>
            ) : null}
          </div>
        }
      />
      <TabsNav base={`/processos/${c.id}`} current={tab} tabs={tabs} />

      {tab === "resumo" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Dados do processo" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item label="Número CNJ">{c.number}</Item>
                <Item label="Número antigo / outro">{c.legacyNumber}</Item>
                <Item label="Área">{c.area}</Item>
                <Item label="Fase">{c.phase}</Item>
                <Item label="Tribunal / órgão">{c.court}</Item>
                <Item label="Vara / unidade">{c.courtUnit}</Item>
                <Item label="UF">{c.courtState}</Item>
                <Item label="Ramo da Justiça (pelo número CNJ)">{cnj ? CNJ_SEGMENTS[cnj.segment] : null}</Item>
                <Item label="Data de distribuição">{c.distributedAt ? formatDate(c.distributedAt, "UTC") : null}</Item>
                <Item label="Valor da causa">{c.claimValue ? formatMoneyBR(c.claimValue.toString()) : null}</Item>
                <div className="sm:col-span-2">
                  <Item label="Assunto">{c.subject ? <span className="whitespace-pre-wrap">{c.subject}</span> : null}</Item>
                </div>
                <div className="sm:col-span-2">
                  <Item label="Observações internas">{c.notes ? <span className="whitespace-pre-wrap">{c.notes}</span> : null}</Item>
                </div>
              </dl>
            </CardBody>
          </Card>
          <div className="space-y-4">
            <SendClientCard targets={await caseMessageTargets(ctx, c.id, organization.name)} source="case" caseId={c.id} />
            <ConversationsCard rows={await conversationsOfCase(ctx, c.id)} />
            <Card>
              <CardHeader title="Situação" />
              <CardBody className="space-y-2">
                <StatusControl caseId={c.id} status={c.status} canWrite={canWrite} />
                <p className="text-xs text-muted">Cada alteração é registrada na linha do tempo e na auditoria.</p>
                {canWrite ? <AcervoButton caseId={c.id} inAcervo={c.archivedAt !== null} /> : null}
              </CardBody>
            </Card>
            <CustomValuesCard
              caseId={c.id}
              canWrite={canWrite}
              defs={customDefs.map((d) => ({ key: d.key, label: d.label, type: d.type, options: d.options }))}
              values={(c.customFields ?? {}) as Record<string, string>}
            />
            {canWrite ? (
              <Card>
                <CardHeader title="Portal do cliente" description="Compartilha só o resumo do processo e os documentos que você marcar, com os clientes vinculados a ele." />
                <CardBody className="space-y-2">
                  <p className="text-xs">{c.sharedWithPortal ? "Compartilhado com o portal." : "Não compartilhado."}</p>
                  <CaseShareToggle caseId={c.id} shared={c.sharedWithPortal} />
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Responsável" />
              <CardBody className="text-sm">{responsible ? responsible.user.name : <span className="text-muted">Não definido</span>}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Registro" />
              <CardBody className="space-y-1 text-xs text-muted">
                <p>Cadastrado em {formatDate(c.createdAt, tz)}</p>
                <p>Atualizado em {formatDate(c.updatedAt, tz)}</p>
              </CardBody>
            </Card>
            {can(ctx, "cases:delete") ? <ArchiveCaseButton caseId={c.id} /> : null}
          </div>
        </div>
      ) : null}

      {tab === "notas" && caseNotes ? (
        <CaseNotesPanel
          caseId={c.id}
          canWrite={canWrite}
          tz={tz}
          notes={caseNotes.map((n) => ({ id: n.id, title: n.title, body: n.body, pinned: n.pinned, authorName: n.authorName, createdAt: n.createdAt.toISOString(), bulk: n.bulkId !== null }))}
        />
      ) : null}

      {tab === "prazos" && canDeadlines ? (
        <Card>
          <CardHeader
            title="Prazos do processo"
            description="Prazos em rascunho ainda precisam de validação humana."
            action={can(ctx, "deadlines:write") ? <Link href={`/prazos/novo?processo=${c.id}`} className={buttonVariants({ size: "sm" })}>Novo prazo</Link> : undefined}
          />
          <CardBody>
            {caseDeadlines && caseDeadlines.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {caseDeadlines.items.map((d) => {
                  const due = dateToYmd(d.dueDate);
                  const st = deadlineDue(due, d.status, tz);
                  return (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <Badge tone={DUE_BADGE[st.state]}>{formatYmd(due)}</Badge>
                      <Link href={`/prazos/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                      <Badge tone={STATUS_TONE[d.status]}>{DEADLINE_STATUS_LABEL[d.status]}</Badge>
                      {dueText(st.state, st.days) ? <span className="text-xs text-muted">{dueText(st.state, st.days)}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nenhum prazo cadastrado para este processo.</p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "tarefas" && canTasks ? (
        <Card>
          <CardHeader
            title="Tarefas do processo"
            action={can(ctx, "tasks:write") ? <Link href={`/tarefas/nova?processo=${c.id}`} className={buttonVariants({ size: "sm" })}>Nova tarefa</Link> : undefined}
          />
          <CardBody>
            {caseTasks && caseTasks.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {caseTasks.items.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link href={`/tarefas/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                    <Badge>{TASK_STATUS_LABEL[t.status]}</Badge>
                    {t.dueDate ? <span className="text-xs text-muted">{formatYmd(dateToYmd(t.dueDate))}</span> : null}
                    {t.assigneeName ? <span className="text-xs text-muted">· {t.assigneeName}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nenhuma tarefa vinculada a este processo.</p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "intimacoes" && canNotices ? (
        <Card>
          <CardHeader title="Intimações do processo" description="Em aberto e tratadas, vinculadas a este processo." />
          <CardBody>
            {caseNotices && caseNotices.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {caseNotices.items.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link href={`/caixa-de-entrada/${n.id}`} className="font-medium hover:underline">{n.title}</Link>
                    <Badge>{NOTICE_KIND_LABEL[n.kind]}</Badge>
                    <Badge tone={n.status === "PROCESSED" ? "success" : "warning"}>{NOTICE_STATUS_LABEL[n.status]}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nenhuma intimação vinculada a este processo.</p>
            )}
            <p className="mt-3 text-xs text-muted">As intimações são tratadas no LegalOS Box. <Link href="/caixa-de-entrada" className="text-primary-text hover:underline" data-testid="case-to-box">Abrir a caixa de entrada</Link></p>
          </CardBody>
        </Card>
      ) : null}

      {tab === "partes" ? (
        <PartiesPanel
          caseId={c.id}
          canWrite={canWrite}
          parties={c.parties.map((p) => ({
            id: p.id,
            role: p.role,
            name: p.name,
            document: p.document,
            lawyerName: p.lawyerName,
            isOurClient: p.isOurClient,
            clientId: p.client && !p.client.deletedAt ? p.client.id : null,
            clientName: p.client?.name ?? null,
          }))}
        />
      ) : null}

      {tab === "andamentos" ? <Timeline caseId={c.id} ctx={ctx} tz={tz} source={sp.fonte} canWrite={canWrite} /> : null}

      {tab === "documentos" ? (
        <DocumentsPanel
          owner={{ caseId: c.id }}
          canWrite={can(ctx, "documents:write")}
          timezone={tz}
          revalidate={`/processos/${c.id}`}
          documents={(await listDocuments(ctx, { caseId: c.id })).map((d) => ({ id: d.id, name: d.name, sizeBytes: d.sizeBytes, createdAt: d.createdAt.toISOString(), currentVersion: d.currentVersion }))}
        />
      ) : null}

      {casePetitions ? (
        <Card>
          <CardHeader
            title="Petições"
            description="Fluxo de revisão e aprovação. O envio é apenas simulado (demonstração)."
            action={can(ctx, "petitions:write") ? <Link href={`/peticoes/nova?processo=${c.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Nova petição</Link> : undefined}
          />
          <CardBody>
            {casePetitions.items.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0">
                <Link href={`/peticoes/${p.id}`} className="text-sm text-primary-text hover:underline">{p.title}</Link>
                <Badge tone={PETITION_STATUS_TONE[p.status as PetitionStatusKey]}>{PETITION_STATUS_LABEL[p.status as PetitionStatusKey]}</Badge>
              </div>
            ))}
            {casePetitions.items.length === 0 ? <p className="text-sm text-muted">Nenhuma petição para este processo.</p> : null}
          </CardBody>
        </Card>
      ) : null}

      {tab === "equipe" ? (
        <MembersPanel
          caseId={c.id}
          canWrite={canWrite}
          confidential={c.confidential}
          members={c.members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role }))}
          candidates={await listAssignableMembers(ctx)}
        />
      ) : null}
    </div>
  );
}

async function Timeline({ caseId, ctx, tz, source, canWrite }: { caseId: string; ctx: Parameters<typeof listCaseEvents>[0]; tz: string; source?: string; canWrite: boolean }) {
  const filter = source === "IMPORTED" || source === "INTERNAL" || source === "AUTOMATIC" ? source : undefined;
  const events = await listCaseEvents(ctx, caseId, filter);
  const filters = [
    { key: undefined, label: "Tudo" },
    { key: "INTERNAL", label: "Registros internos" },
    { key: "AUTOMATIC", label: "Automáticos" },
    { key: "IMPORTED", label: "Importados do tribunal" },
  ] as const;
  return (
    <div className="space-y-4">
      {canWrite ? (
        <Card>
          <CardHeader title="Nova anotação" description="Registro interno do escritório, identificado como tal na linha do tempo." />
          <CardBody>
            <NoteForm caseId={caseId} />
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Linha do tempo" description="Andamentos importados de tribunais serão exibidos aqui quando a integração for implementada (Fases 4 e 8); hoje só há registros internos e automáticos." />
        <CardBody>
          <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por origem">
            {filters.map((f) => (
              <Link
                key={f.label}
                href={`/processos/${caseId}?aba=andamentos${f.key ? `&fonte=${f.key}` : ""}`}
                aria-current={filter === f.key ? "true" : undefined}
                className={`rounded-full border px-2.5 py-1 text-xs ${filter === f.key ? "border-primary bg-info-bg text-primary-text" : "border-border text-muted hover:text-fg"}`}
              >
                {f.label}
              </Link>
            ))}
          </div>
          {events.length === 0 ? <p className="text-sm text-muted">Nenhum evento para este filtro.</p> : null}
          <ol className="relative space-y-4 border-l border-border pl-5">
            {events.map((e) => {
              const s = SOURCE[e.source];
              return (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface">
                    <s.Icon className="h-2.5 w-2.5 text-muted" aria-hidden />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{e.title}</p>
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {e.kind !== "NOTE" ? <span className="text-xs text-muted">{EVENT_KIND_LABEL[e.kind] ?? e.kind}</span> : null}
                  </div>
                  {e.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{e.description}</p> : null}
                  <p className="mt-1 text-xs text-muted">
                    {isDateOnly(e.occurredAt) ? formatDate(e.occurredAt, "UTC") : formatDateTime(e.occurredAt, tz)}
                    {e.authorName ? ` · ${e.authorName}` : ""}
                  </p>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
