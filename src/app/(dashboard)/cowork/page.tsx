import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { coworkAvailability, displayNames, getCoworkSettings, listCoworkPeople } from "@/server/services/cowork-access.service";
import { ensureWorkspace, listMyChannels } from "@/server/services/cowork-channel.service";
import { computeWorkStates } from "@/server/services/cowork-insights.service";
import { listMeetings } from "@/server/services/cowork-meeting.service";
import { CoworkWorkspace } from "@/modules/cowork/workspace";

export const metadata: Metadata = { title: "Cowork" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DENIED: Record<string, string> = {
  permission: "Seu perfil não inclui o Cowork. Peça a quem administra o escritório para liberar a permissão “Usar o Cowork”.",
  disabled: "O Cowork está desativado neste escritório.",
  blocked: "Seu acesso ao Cowork foi suspenso pela administração do escritório.",
};

export default async function CoworkPage({ searchParams }: { searchParams: Promise<{ c?: string; m?: string; t?: string }> }) {
  const { ctx } = await requireTenant();
  const availability = await coworkAvailability(ctx);
  if (!availability.ok) return <div className="p-6"><AccessDenied detail={DENIED[availability.reason]} /></div>;
  await ensureWorkspace(ctx);
  const sp = await searchParams;
  const [channels, people, meetings, settings, names] = await Promise.all([listMyChannels(ctx), listCoworkPeople(ctx), listMeetings(ctx, "upcoming"), getCoworkSettings(ctx.organizationId), displayNames(ctx.organizationId, [ctx.userId])]);
  const states = await computeWorkStates(ctx, people.map((p) => p.id));
  const initialChannelId = sp.c && UUID.test(sp.c) && channels.some((c) => c.id === sp.c) ? sp.c : null;
  return (
    <CoworkWorkspace
      me={{ id: ctx.userId, name: names.get(ctx.userId) ?? "Você" }}
      perms={{
        write: can(ctx, "cowork:write"),
        channels: can(ctx, "cowork:channels"),
        share: can(ctx, "cowork:share"),
        meetings: can(ctx, "cowork:meetings"),
        insights: can(ctx, "cowork:insights"),
        manage: can(ctx, "cowork:manage"),
        members: can(ctx, "cowork:members"),
        tasksWrite: can(ctx, "tasks:write"),
        agendaWrite: can(ctx, "deadlines:write") || can(ctx, "tasks:write"),
        casesRead: can(ctx, "cases:read"),
        allowDirect: settings.allowDirect,
      }}
      initialChannels={channels}
      people={people.map((p) => ({ ...p, workState: states.get(p.id) ?? "NOT_INFORMED" }))}
      initialChannelId={initialChannelId}
      initialThreadId={initialChannelId && sp.t && UUID.test(sp.t) ? sp.t : null}
      focusMessageId={initialChannelId && sp.m && UUID.test(sp.m) ? sp.m : null}
      meetings={meetings.map((m) => ({ id: m.id, title: m.title, date: m.date, startTime: m.startTime, status: m.status }))}
    />
  );
}
