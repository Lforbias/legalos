import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { isYmd, todayYmd } from "@/lib/dates/ymd";
import { EMPTY_EVENT } from "@/modules/agenda/schemas";
import { EventForm } from "@/modules/agenda/event-form";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo compromisso" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ data?: string; processo?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "deadlines:write") && !can(ctx, "tasks:write")) return <AccessDenied />;
  const sp = await searchParams;
  const cases = can(ctx, "cases:read") ? await listCaseOptions(ctx) : [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo compromisso" />
      <EventForm
        initial={{ ...EMPTY_EVENT, date: sp.data && isYmd(sp.data) ? sp.data : todayYmd(ctx.timezone), caseId: cases.some((c) => c.id === sp.processo) ? (sp.processo as string) : "" }}
        cases={cases}
      />
    </div>
  );
}
