import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { dateToYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { DeadlineForm } from "@/modules/deadlines/deadline-form";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { getDeadline } from "@/server/services/deadline.service";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar prazo" };

export default async function EditDeadlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "deadlines:write") || !can(ctx, "cases:read")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const d = await getDeadline(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!d || d.status === "FULFILLED" || d.status === "CANCELED") notFound();
  const [members, cases] = await Promise.all([listActiveMembers(ctx), listCaseOptions(ctx)]);
  const ymd = (x: Date | null) => (x ? dateToYmd(x) : "");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Editar prazo" description={d.status === "VALIDATED" ? "Alterar a data fatal desfaz a validação: o prazo voltará a aguardar validação." : undefined} />
      <DeadlineForm
        deadlineId={d.id}
        members={members}
        cases={cases}
        initial={{
          caseId: d.caseId, title: d.title, kind: d.kind ?? "", startDate: ymd(d.startDate), days: d.days ? String(d.days) : "", countType: d.countType ?? "",
          dueDate: ymd(d.dueDate), internalDueDate: ymd(d.internalDueDate), responsibleId: d.responsibleId ?? "", notes: d.notes ?? "", calculationNote: d.calculationNote ?? "",
        }}
      />
    </div>
  );
}
