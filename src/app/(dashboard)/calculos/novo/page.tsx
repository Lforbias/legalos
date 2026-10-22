import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { CalculatorForm } from "@/modules/calculos/calculator-form";
import { CALC_KINDS, CALC_KIND_LABEL, type CalcKind } from "@/modules/calculos/schemas";
import { can } from "@/server/context";
import { db } from "@/lib/db/client";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo cálculo" };

export default async function NovoCalculoPage({ searchParams }: { searchParams: Promise<{ tipo?: string; processo?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const sp = await searchParams;
  const kind = (CALC_KINDS as readonly string[]).includes(sp.tipo ?? "") ? (sp.tipo as CalcKind) : "JF_ATRASADOS";
  const caseId = /^[0-9a-f-]{36}$/i.test(sp.processo ?? "") ? sp.processo! : null;
  const c = caseId ? await db.case.findFirst({ where: { id: caseId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, title: true, number: true } }) : null;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={CALC_KIND_LABEL[kind]} description="Preencha os dados e confira o resultado antes de salvar." />
      <Card><CardBody><CalculatorForm key={kind} kind={kind} caseId={c?.id ?? null} caseLabel={c ? `${c.title}${c.number ? ` (${c.number})` : ""}` : undefined} /></CardBody></Card>
    </div>
  );
}
