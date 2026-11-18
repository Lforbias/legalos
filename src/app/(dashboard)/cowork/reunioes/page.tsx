import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { EmptyState } from "@/components/evolution/empty-state";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { RecordBackLink } from "@/components/layout/record-back-link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatYmd } from "@/lib/dates/ymd";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { coworkAvailability } from "@/server/services/cowork-access.service";
import { listMeetings } from "@/server/services/cowork-meeting.service";
import { MEETING_STATUS_LABEL, RSVP_LABEL } from "@/modules/cowork/constants";

export const metadata: Metadata = { title: "Reuniões — Cowork" };
export const dynamic = "force-dynamic";

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { ctx } = await requireTenant();
  if (!(await coworkAvailability(ctx)).ok) return <AccessDenied />;
  const past = (await searchParams).v === "historico";
  const rows = await listMeetings(ctx, past ? "past" : "upcoming");
  return (
    <div className="mx-auto max-w-5xl">
      <RecordBackLink href="/cowork">Cowork</RecordBackLink>
      <PageHeader
        title="Reuniões"
        description="Reuniões internas da equipe: convites, agenda do escritório, presença, ata e encaminhamentos que viram tarefas."
        actions={can(ctx, "cowork:meetings") ? <Link href="/cowork/reunioes/nova" className={buttonVariants({ size: "sm" })} data-testid="meeting-new"><Plus className="h-4 w-4" aria-hidden /> Nova reunião</Link> : null}
      />
      <div className="mb-4 flex gap-2 text-sm">
        <Link href="/cowork/reunioes" aria-current={!past ? "page" : undefined} className={!past ? "rounded-full bg-surface-2 px-3 py-1 font-medium" : "rounded-full px-3 py-1 text-muted hover:bg-surface-2"}>Próximas</Link>
        <Link href="/cowork/reunioes?v=historico" aria-current={past ? "page" : undefined} className={past ? "rounded-full bg-surface-2 px-3 py-1 font-medium" : "rounded-full px-3 py-1 text-muted hover:bg-surface-2"}>Histórico</Link>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title={past ? "Nenhuma reunião no histórico" : "Nenhuma reunião agendada"} description="As reuniões em que você participa aparecem aqui." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((m) => (
              <li key={m.id}>
                <Link href={`/cowork/reunioes/${m.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-surface-2" data-testid="meeting-row">
                  <span className="w-28 shrink-0 text-sm tabular-nums">{formatYmd(m.date)} {m.startTime}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.title}</span>
                  <span className="text-xs text-muted">{m.participantCount} participante(s) · anfitrião: {m.hostName}</span>
                  <span className="text-xs text-muted">{MEETING_STATUS_LABEL[m.status]}{m.myRsvp ? ` · ${RSVP_LABEL[m.myRsvp]}` : ""}{m.hasMinutes ? " · com ata" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
