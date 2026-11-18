import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { RecordBackLink } from "@/components/layout/record-back-link";
import { Card, CardBody } from "@/components/ui/card";
import { todayYmd } from "@/lib/dates/ymd";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { coworkAvailability, listCoworkPeople } from "@/server/services/cowork-access.service";
import { listMyChannels } from "@/server/services/cowork-channel.service";
import { computeWorkStates } from "@/server/services/cowork-insights.service";
import { MeetingForm } from "@/modules/cowork/meeting-ui";

export const metadata: Metadata = { title: "Nova reunião — Cowork" };
export const dynamic = "force-dynamic";

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ canal?: string }> }) {
  const { ctx } = await requireTenant();
  if (!(await coworkAvailability(ctx)).ok || !can(ctx, "cowork:meetings")) return <AccessDenied detail="Seu perfil não cria reuniões no Cowork." />;
  const [people, channels] = await Promise.all([listCoworkPeople(ctx), listMyChannels(ctx)]);
  const states = await computeWorkStates(ctx, people.map((p) => p.id));
  const canal = (await searchParams).canal ?? "";
  return (
    <div className="mx-auto max-w-3xl">
      <RecordBackLink href="/cowork/reunioes">Reuniões</RecordBackLink>
      <PageHeader title="Nova reunião" description="Convide a equipe, vincule a conversa, processo ou tarefa e registre na agenda do escritório." />
      <Card>
        <CardBody>
          <MeetingForm
            people={people.map((p) => ({ ...p, workState: states.get(p.id) ?? "NOT_INFORMED" }))}
            meId={ctx.userId}
            channels={channels.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.kind === "CHANNEL" ? `#${c.name}` : c.name }))}
            defaultChannelId={channels.some((c) => c.id === canal) ? canal : ""}
            canAgenda={can(ctx, "deadlines:write") || can(ctx, "tasks:write")}
            canCases={can(ctx, "cases:read")}
            today={todayYmd(ctx.timezone)}
          />
        </CardBody>
      </Card>
    </div>
  );
}
