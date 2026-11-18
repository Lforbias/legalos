import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoOff } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { RecordBackLink } from "@/components/layout/record-back-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { coworkAvailability, listCoworkPeople } from "@/server/services/cowork-access.service";
import { resolveCards } from "@/server/services/cowork-resource.service";
import { computeWorkStates } from "@/server/services/cowork-insights.service";
import { getMeeting } from "@/server/services/cowork-meeting.service";
import { MEETING_STATUS_LABEL, WORK_PURPOSE_LABEL, type ResourceKind, type WorkPurpose } from "@/modules/cowork/constants";
import { ResourceCardView } from "@/modules/cowork/message-item";
import { ActionItemForm, AttendanceList, MeetingControls, MinutesForm } from "@/modules/cowork/meeting-ui";
import { VideoRoom } from "@/modules/cowork/video-room";

export const metadata: Metadata = { title: "Reunião — Cowork" };
export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!(await coworkAvailability(ctx)).ok) return <AccessDenied />;
  const meeting = await getMeeting(ctx, (await params).id).catch((e) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });
  if (!meeting) notFound();
  const items = meeting.workItems.flatMap((w): { kind: ResourceKind; resourceId: string; purpose: string }[] => (w.taskId ? [{ kind: "TASK", resourceId: w.taskId, purpose: w.purpose }] : w.agendaEventId ? [{ kind: "EVENT", resourceId: w.agendaEventId, purpose: w.purpose }] : []));
  const [people, cards] = await Promise.all([listCoworkPeople(ctx), resolveCards(ctx, items)]);
  const states = await computeWorkStates(ctx, people.map((p) => p.id));
  const persons = people.map((p) => ({ ...p, workState: states.get(p.id) ?? "NOT_INFORMED" as const }));
  const tone = meeting.status === "IN_PROGRESS" ? "success" : meeting.status === "CANCELED" ? "danger" : "neutral";
  return (
    <div className="mx-auto max-w-5xl">
      <RecordBackLink href="/cowork/reunioes">Reuniões</RecordBackLink>
      <PageHeader
        title={meeting.title}
        description={`${formatYmd(meeting.date)} · ${meeting.startTime}${meeting.endTime ? `–${meeting.endTime}` : ""} · anfitrião: ${meeting.hostName}`}
        actions={<Badge tone={tone} data-testid="meeting-status">{MEETING_STATUS_LABEL[meeting.status]}</Badge>}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-4">
              <MeetingControls id={meeting.id} status={meeting.status} isParticipant={meeting.isParticipant} myRsvp={meeting.myRsvp} canAdmin={meeting.canAdmin} />
              {!meeting.video.enabled ? (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/60 p-3 text-sm" data-testid="meeting-video-disabled">
                  <VideoOff className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <p className="text-muted">{meeting.video.reason} Use a reunião para organizar convites, presença, ata e encaminhamentos.</p>
                </div>
              ) : meeting.status === "IN_PROGRESS" && meeting.isParticipant && meeting.myRsvp !== "DECLINED" ? (
                <VideoRoom meetingId={meeting.id} />
              ) : (
                <p className="rounded-lg border border-border bg-surface-2/60 p-3 text-sm text-muted" data-testid="meeting-video-waiting">{meeting.status === "SCHEDULED" ? "A chamada de vídeo abre quando o anfitrião iniciar a reunião." : meeting.status === "IN_PROGRESS" ? "Só participantes convidados que não recusaram entram na chamada." : "A reunião terminou; a chamada foi encerrada."}</p>
              )}
              {meeting.description ? <div><h3 className="text-xs font-semibold uppercase text-muted">Pauta</h3><p className="mt-1 whitespace-pre-wrap text-sm">{meeting.description}</p></div> : null}
              <div className="flex flex-wrap gap-3 text-xs text-muted">
                {meeting.channel ? <Link className="underline" href={`/cowork?c=${meeting.channel.id}`}>Conversa: {meeting.channel.kind === "CHANNEL" ? `#${meeting.channel.name}` : meeting.channel.name}</Link> : null}
                {meeting.case ? <Link className="underline" href={`/processos/${meeting.case.id}`}>Processo: {meeting.case.title}</Link> : null}
                {meeting.task ? <Link className="underline" href={`/tarefas/${meeting.task.id}`}>Tarefa: {meeting.task.title}</Link> : null}
                {meeting.agendaEventId && (can(ctx, "deadlines:read") || can(ctx, "tasks:read")) ? <Link className="underline" href={`/agenda/${meeting.agendaEventId}`}>Na agenda do escritório</Link> : <span>Fora da agenda do escritório</span>}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Ata e decisões" description={meeting.minutesAt ? `Registrada por ${meeting.minutesBy ?? "—"} em ${new Date(meeting.minutesAt).toLocaleString("pt-BR", { timeZone: ctx.timezone })}` : "Registre o que foi discutido e decidido."} />
            <CardBody><MinutesForm id={meeting.id} minutes={meeting.minutes ?? ""} decisions={meeting.decisions ?? ""} canEdit={meeting.canAdmin && meeting.status !== "CANCELED"} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Encaminhamentos" description="Cada encaminhamento vira tarefa ou compromisso no módulo original, com responsável e prazo." />
            <CardBody className="space-y-3">
              {cards.length === 0 ? <p className="text-sm text-muted">Nenhum encaminhamento registrado.</p> : (
                <ul className="space-y-2" data-testid="meeting-action-items">
                  {cards.map((c, i) => (
                    <li key={`${c.kind}:${c.id}`} className="space-y-1">
                      <span className="text-[11px] text-muted">{WORK_PURPOSE_LABEL[items[i]?.purpose as WorkPurpose] ?? "Trabalho"}</span>
                      <ResourceCardView card={c} />
                    </li>
                  ))}
                </ul>
              )}
              {meeting.canAdmin && meeting.status !== "CANCELED" ? <ActionItemForm id={meeting.id} people={persons} canTasks={can(ctx, "tasks:write")} canAgenda={can(ctx, "deadlines:write") || can(ctx, "tasks:write")} /> : null}
            </CardBody>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Participantes" description={meeting.status === "SCHEDULED" ? "Presença pode ser registrada depois de iniciar." : "Presença registrada pelo anfitrião."} />
          <CardBody>
            <AttendanceList id={meeting.id} participants={meeting.participants} canMark={meeting.canAdmin && (meeting.status === "IN_PROGRESS" || meeting.status === "ENDED")} people={persons} canEditParticipants={meeting.canAdmin && (meeting.status === "SCHEDULED" || meeting.status === "IN_PROGRESS")} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
