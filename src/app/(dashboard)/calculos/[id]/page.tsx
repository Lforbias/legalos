import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { NotFoundError } from "@/lib/permissions/check";
import { CalcResultView } from "@/modules/calculos/result-view";
import { DeleteCalcButton } from "@/modules/calculos/delete-button";
import { can } from "@/server/context";
import { getCalculation } from "@/server/services/calculation.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Cálculo" };

export default async function CalculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let c;
  try { c = await getCalculation(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={c.title}
        description={`${c.createdAt.toLocaleDateString("pt-BR")} · salvo no sistema`}
        actions={
          <div className="flex flex-wrap gap-2">
            <a className={buttonVariants({ variant: "secondary" })} href={`/api/calculos/${c.id}/export?formato=xlsx`}>Planilha Excel</a>
            <a className={buttonVariants({ variant: "secondary" })} href={`/api/calculos/${c.id}/export?formato=csv`}>CSV</a>
            <a className={buttonVariants({ variant: "secondary" })} href={`/api/calculos/${c.id}/export?formato=txt`}>Memória de cálculo</a>
            {c.caseId ? <Link className={buttonVariants({ variant: "ghost" })} href={`/processos/${c.caseId}`}>Ver processo</Link> : null}
            {can(ctx, "cases:write") ? <DeleteCalcButton id={c.id} /> : null}
          </div>
        }
      />
      <Card><CardBody><CalcResultView result={c.result} /></CardBody></Card>
    </div>
  );
}
