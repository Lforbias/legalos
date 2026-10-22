import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IndexesPanel } from "@/modules/calculos/indexes-panel";
import { can } from "@/server/context";
import { listSeriesRows, SERIES_LABEL } from "@/server/services/calculation.service";
import { indexCoverage } from "@/server/services/monetary-index.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Índices dos cálculos" };
const ALL = ["INPC", "SELIC", "IPCA", "IPCAE", "TR", "TJSP", "REAJUSTE_INSS", "SALMIN"];

export default async function IndicesPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const [cov, ...lists] = await Promise.all([indexCoverage(ctx), ...ALL.map((s) => listSeriesRows(ctx, s, 6))]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Índices dos cálculos" description="INPC, IPCA e SELIC vêm do Banco Central. O resto (IPCA-E, TR, tabela do TJSP, reajuste do INSS e salário mínimo) é lançado pelo escritório, com a fonte. Mês sem índice impede o cálculo: o sistema nunca inventa número." actions={<Link href="/calculos" className="text-sm underline">Voltar aos cálculos</Link>} />
      <Card className="mb-5"><CardBody><IndexesPanel canManage={can(ctx, "finance:manage")} /></CardBody></Card>
      <div className="grid gap-4 md:grid-cols-2">
        {ALL.map((s, i) => (
          <Card key={s}>
            <CardHeader title={SERIES_LABEL[s]!} description={cov.find((c) => c.series === s) ? `${cov.find((c) => c.series === s)!.months} meses · último ${cov.find((c) => c.series === s)!.last}` : "Últimos lançamentos"} />
            <CardBody>
              {lists[i]!.length === 0 ? <p className="text-sm text-muted">Nada cadastrado.</p> : (
                <ul className="space-y-1 text-xs">{lists[i]!.map((r) => <li key={r.month} className="flex justify-between"><span>{r.month}</span><span>{r.value} <span className="text-muted">({r.own ? "escritório" : "BCB"})</span></span></li>)}</ul>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
