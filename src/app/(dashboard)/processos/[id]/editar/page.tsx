import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { CaseForm } from "@/modules/cases/case-form";
import { can } from "@/server/context";
import { getCase, listAssignableMembers, listCaseDepartments } from "@/server/services/case.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar processo" };

export default async function EditCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:write")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const [c, members, departments] = await Promise.all([
    getCase(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e))),
    listAssignableMembers(ctx),
    listCaseDepartments(ctx),
  ]);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Editar: ${c.title}`} />
      <CaseForm
        caseId={c.id}
        members={members}
        departments={departments}
        initial={{
          nature: c.nature as "CASE" | "ADMINISTRATIVE" | "JUDICIAL",
          departmentId: c.departmentId ?? "",
          number: c.number ?? "",
          courtSystem: (c.courtSystem ?? "") as "" | "pje-mni" | "eproc" | "esaj" | "projudi", legacyNumber: c.legacyNumber ?? "",
          title: c.title,
          area: c.area ?? "",
          court: c.court ?? "",
          courtUnit: c.courtUnit ?? "",
          courtState: c.courtState ?? "",
          subject: c.subject ?? "",
          claimValue: c.claimValue ? c.claimValue.toFixed(2).replace(".", ",") : "",
          status: c.status,
          phase: c.phase ?? "",
          distributedAt: c.distributedAt ? c.distributedAt.toISOString().slice(0, 10) : "",
          confidential: c.confidential,
          notes: c.notes ?? "",
          responsibleId: c.members.find((m) => m.role === "RESPONSIBLE")?.userId ?? "",
          clientId: "",
          clientRole: "PLAINTIFF",
        }}
      />
    </div>
  );
}
