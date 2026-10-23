import { listActiveMembers } from "@/server/services/members";
import { ActivityDetailsSection } from "@/modules/activities/details-section";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { EventForm } from "@/modules/agenda/event-form";
import { can } from "@/server/context";
import { getEvent } from "@/server/services/agenda.service";
import { listCaseOptions } from "@/server/services/case.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Compromisso" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "deadlines:read") && !can(ctx, "tasks:read")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const e = await getEvent(ctx, parsed.data).catch((x) => (x instanceof NotFoundError ? null : Promise.reject(x)));
  if (!e) notFound();
  const editable = can(ctx,"deadlines:write") || can(ctx,"tasks:write");
  const members=await listActiveMembers(ctx);
  const cases = can(ctx, "cases:read") ? await listCaseOptions(ctx) : [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={editable?"Editar compromisso":e.title} />
      {editable ? <EventForm
        eventId={e.id}
        cases={cases}
        members={members.map(m=>({id:m.id,name:m.name}))}
        initialClientLabel={e.client?.name ?? ""}
        initial={{
          title: e.title, kind: e.kind, date: e.date, allDay: e.allDay, startTime: e.allDay ? "09:00" : e.startTime, endTime: e.endTime,
          location: e.location ?? "", description: e.description ?? "", caseId: e.caseId ?? "", clientId: e.clientId ?? "", assigneeId:e.assigneeId??"",
        }}
      /> : <div className="space-y-2 text-sm"><p>{e.date} {e.startTime} — {e.location}</p><p className="whitespace-pre-wrap">{e.description}</p></div>}
      <ActivityDetailsSection ctx={ctx} kind="EVENT" id={e.id} />
    </div>
  );
}
