import { noticeDisplayText } from "@/lib/notices/display";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { COUNT_TYPE_LABEL } from "@/modules/deadlines/schemas";
import { AssignControl, LinkCaseControl, StatusControls } from "@/modules/inbox/notice-controls";
import { NOTICE_KIND_LABEL, NOTICE_SOURCE_LABEL, NOTICE_STATUS_LABEL } from "@/modules/inbox/schemas";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { listActiveMembers } from "@/server/services/members";
import { getNotice } from "@/server/services/notice.service";
import { suggestAvailability } from "@/server/services/notice-desk.service";
import { SuggestPanel } from "@/modules/inbox/suggest-panel";
import { TriagePanel } from "@/modules/inbox/triage-panel";
import { getTriage, triageAvailability } from "@/server/services/notice-triage.service";
import { ACTS } from "@/lib/calc/prazos";
import { listTeams } from "@/server/services/inbox-flow.service";
import { FlowButtons, NotesPanel, TagsEditor, TeamAssignControl } from "@/modules/inbox/flow-controls";
import { listDocuments } from "@/server/services/document.service";
import { todayYmd } from "@/lib/dates/ymd";
import { requireTenant } from "@/server/session";
import { boxV2Enabled } from "@/lib/features";
import { getNoticeTimeline } from "@/server/judicial/inbox-v2.service";
import { NoticeStatesCard, NoticeTimelineCard } from "@/modules/box/notice-states";
import { ViewTracker } from "@/modules/box/view-tracker";
import { db } from "@/lib/db/client";


const TONE = { NEW: "warning", DISTRIBUTED: "info", PROCESSED: "success", DISCARDED: "neutral" } as const;

export async function NoticeReader({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "inbox:read")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) notFound();
  const n = await getNotice(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!n) notFound();
  const tz = organization.timezone;
  const canWrite = can(ctx, "inbox:write");
  const open = n.status === "NEW" || n.status === "DISTRIBUTED";
  const [members, cases] = await Promise.all([canWrite ? listActiveMembers(ctx) : [], canWrite && can(ctx, "cases:read") ? listCaseOptions(ctx) : []]);
  const teams = await listTeams(ctx);
  const myTeam = n.teamId ? teams.find((t) => t.id === n.teamId)?.members.some((m) => m.id === ctx.userId) ?? false : false;
  const canReturn = canWrite && n.status === "DISTRIBUTED" && (n.assigneeId === ctx.userId || myTeam);
  const today = todayYmd(tz);
  const q = new URLSearchParams({ intimacao: n.id });
  if (n.caseId) q.set("processo", n.caseId);
  const p = n.parsed;
  const sug = await suggestAvailability(ctx);
  const tri = await getTriage(ctx, n.id);
  const triAv = triageAvailability(ctx);
  const v2 = boxV2Enabled(ctx.organizationId);
  const [timeline, firstViewedBy] = v2
    ? await Promise.all([getNoticeTimeline(ctx, n.id), n.firstViewedById ? db.user.findFirst({ where: { id: n.firstViewedById }, select: { name: true } }) : Promise.resolve(null)])
    : [[], null];
  const documents = n.caseId && can(ctx, "documents:read") && can(ctx, "cases:read") ? await listDocuments(ctx, { caseId: n.caseId }) : [];

  return (
    <div className={embedded ? "min-w-0" : "mx-auto max-w-5xl"}>
      {v2 ? <ViewTracker noticeId={n.id} /> : null}
      <PageHeader
        title={n.title}
        description={`${NOTICE_KIND_LABEL[n.kind]} · ${NOTICE_SOURCE_LABEL[n.source]} · recebida em ${formatYmd(dateToYmd(n.receivedAt))}`}
        actions={<Badge tone={TONE[n.status]}>{NOTICE_STATUS_LABEL[n.status]}</Badge>}
      />
      {n.duplicateOf ? (
        <div className="mb-4">
          <Alert tone="warning">
            Teor idêntico ao de outra intimação já registrada: <Link className="underline" href={`/caixa-de-entrada/${n.duplicateOf.id}`}>{n.duplicateOf.title}</Link> ({formatYmd(dateToYmd(n.duplicateOf.receivedAt))}). Confira e descarte se for repetida.
          </Alert>
        </div>
      ) : null}
      {n.status === "DISCARDED" && n.discardReason ? <div className="mb-4"><Alert tone="info">Descartada: {n.discardReason}</Alert></div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Teor" />
            <CardBody><p className="whitespace-pre-wrap text-sm">{noticeDisplayText(n.content)}</p></CardBody>
          </Card>
          <Card>
            <CardHeader title="Triagem com minuta" description="O que exige, prazo calculado e minuta em rascunho. Sempre validada por uma pessoa." />
            <CardBody>
              <TriagePanel key={`${tri?.status}:${tri?.minuta?.length ?? 0}:${tri?.source}`} noticeId={n.id} canWrite={canWrite && open} canAi={triAv.canAi} canDeadline={can(ctx, "deadlines:write")} hasCase={Boolean(n.caseId)} dueFmt={tri?.dueDate ? formatYmd(tri.dueDate) : null} triage={tri ? { summary: tri.summary, requirement: tri.requirement, actLabel: tri.actKey ? ACTS.find((a) => a.key === tri.actKey)?.label ?? null : null, days: tri.days, countType: tri.countType, dueDate: tri.dueDate, minuta: tri.minuta ?? "", source: tri.source, status: tri.status } : null} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Providências" description="Tarefas e prazos criados a partir desta intimação." />
            <CardBody className="space-y-3">
              {p.suggestedDays ? (
                <Alert tone="info">
                  O texto menciona prazo de <strong>{p.suggestedDays} dia(s){p.suggestedCount ? ` (${COUNT_TYPE_LABEL[p.suggestedCount].toLowerCase()})` : ""}</strong>. É apenas uma leitura automática do texto: confira o dispositivo e as regras aplicáveis antes de cadastrar o prazo.
                </Alert>
              ) : null}
              {canWrite && open ? <SuggestPanel noticeId={n.id} query={q.toString()} canTask={can(ctx, "tasks:write")} canDeadline={can(ctx, "deadlines:write")} hasCase={Boolean(n.caseId)} disabledReason={sug.reason} /> : null}
              {n.tasks.length + n.deadlines.length === 0 ? <p className="text-sm text-muted">Nenhuma providência criada ainda.</p> : null}
              <ul className="space-y-1 text-sm">
                {n.deadlines.map((d) => (
                  <li key={d.id}><Badge tone="warning">Prazo</Badge> <Link className="hover:underline" href={`/prazos/${d.id}`}>{d.title}</Link> <span className="text-xs text-muted">· {formatYmd(dateToYmd(d.dueDate))}</span></li>
                ))}
                {n.tasks.map((t) => (
                  <li key={t.id}><Badge tone="info">Tarefa</Badge> <Link className="hover:underline" href={`/tarefas/${t.id}`}>{t.title}</Link></li>
                ))}
              </ul>
              {canWrite && open ? (
                <div className="flex flex-wrap gap-2">
                  {can(ctx, "tasks:write") ? <Link href={`/tarefas/nova?${q}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Criar tarefa</Link> : null}
                  {can(ctx, "deadlines:write") && n.caseId ? <Link href={`/prazos/novo?${q}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Cadastrar prazo</Link> : null}
                  {can(ctx, "deadlines:write") && !n.caseId ? <span className="text-xs text-muted">Vincule a um processo para cadastrar prazo.</span> : null}
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          {v2 ? <NoticeStatesCard n={n} capturedAt={n.capturedAt} firstViewedAt={n.firstViewedAt} firstViewedByName={firstViewedBy?.name ?? null} officialAckAt={n.officialAckAt} tz={tz} /> : null}
          <Card>
            <CardHeader title="Notas internas" description="Só a equipe vê." />
            <CardBody><NotesPanel id={n.id} notes={n.notes.map((x) => ({ id: x.id, body: x.body, authorId: x.authorId, authorName: x.authorName, createdAt: x.createdAt.toISOString() }))} fmt={n.notes.map((x) => formatDateTime(x.createdAt, tz))} canWrite={canWrite} myId={ctx.userId} isOwner={ctx.isOwner} /></CardBody>
          </Card>
          {n.case && can(ctx, "cases:read") ? <Card>
            <CardHeader title="Contexto do processo" />
            <CardBody className="space-y-3 text-sm">
              <Link className="font-medium underline" href={`/processos/${n.case.id}`}>{n.case.title}</Link>
              <div className="flex flex-wrap gap-2">
                {can(ctx, "documents:read") ? <Link className="underline" href={`/processos/${n.case.id}/autos`}>Autos digitais ({documents.length}{documents.length === 200 ? "+" : ""})</Link> : null}
                {can(ctx, "tasks:read") ? <Link className="underline" href={`/processos/${n.case.id}?aba=tarefas`}>Tarefas</Link> : null}
                {can(ctx, "deadlines:read") ? <Link className="underline" href={`/processos/${n.case.id}?aba=prazos`}>Prazos</Link> : null}
              </div>
              {documents.slice(0, 5).map(d => <p key={d.id}><Link className="underline" href={`/processos/${n.case!.id}/autos?documento=${d.id}`}>{d.name}</Link></p>)}
            </CardBody>
          </Card> : null}
          <Card>
            <CardHeader title="Dados" />
            <CardBody className="space-y-2 text-sm">
              <p><span className="text-xs text-muted">Processo (número)</span><br />{n.caseNumber ?? "—"}</p>
              <p><span className="text-xs text-muted">Processo vinculado</span><br />{n.case ? <Link className="hover:underline" href={`/processos/${n.case.id}`}>{n.case.title}</Link> : "—"}</p>
              <p><span className="text-xs text-muted">Tribunal / órgão</span><br />{n.court ?? "—"}</p>
              <p><span className="text-xs text-muted">Publicação</span><br />{n.publishedAt ? formatYmd(dateToYmd(n.publishedAt)) : "—"}</p>
              <p><span className="text-xs text-muted">Responsável</span><br />{n.assigneeName ?? (n.team ? `Equipe ${n.team.name}` : "—")}</p>
              {n.assignedByName ? <p><span className="text-xs text-muted">Encarregada por</span><br />{n.assignedByName}</p> : null}
              <div><span className="text-xs text-muted">Etiquetas</span><TagsEditor id={n.id} tags={n.tags} canWrite={canWrite} /></div>
              {n.processedAt ? <p className="text-xs text-muted">Encerrada{n.processedByName ? ` por ${n.processedByName}` : ""} em {formatDateTime(n.processedAt, tz)}</p> : null}
            </CardBody>
          </Card>
          {canWrite && open ? (
            <>
              <Card>
                <CardHeader title="Distribuir" />
                <CardBody className="space-y-4">
                  <AssignControl id={n.id} members={members} current={n.assigneeId ?? ""} />
                  <TeamAssignControl id={n.id} teams={teams.map((t) => ({ id: t.id, name: t.name }))} current={n.teamId ?? ""} />
                </CardBody>
              </Card>
              {can(ctx, "cases:read") ? (
                <Card>
                  <CardHeader title="Processo" />
                  <CardBody><LinkCaseControl id={n.id} cases={cases} current={n.caseId ?? ""} /></CardBody>
                </Card>
              ) : null}
            </>
          ) : null}
          {canWrite && n.status !== "DISCARDED" ? (
            <Card>
              <CardHeader title="Fluxo" description="Devolver, voltar à Entrada ou adormecer." />
              <CardBody><FlowButtons id={n.id} status={n.status} canReturn={canReturn} snoozedUntil={n.snoozedUntil ? dateToYmd(n.snoozedUntil) : null} today={today} /></CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Situação" />
            <CardBody><StatusControls id={n.id} status={n.status} canWrite={canWrite} canDelete={canWrite} /></CardBody>
          </Card>
          {v2 ? <NoticeTimelineCard entries={timeline} tz={tz} /> : null}
        </div>
      </div>
    </div>
  );
}
