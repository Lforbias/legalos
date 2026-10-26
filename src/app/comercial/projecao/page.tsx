import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { brl } from "@/lib/comercial/format";
import { SCENARIOS } from "@/lib/comercial/projection";
import { SettingsForm } from "@/modules/comercial/admin-forms";
import { ProjectionChart } from "@/modules/comercial/projection-chart";
import { requireComercial } from "@/server/comercial";
import { dashboard } from "@/server/services/comercial.service";

export const metadata: Metadata = { title: "LegalOS Comercial — projeção" };
export const dynamic = "force-dynamic";

export default async function ProjectionPage() {
  const { cx } = await requireComercial();
  const d = await dashboard(cx);
  return (
    <div className="space-y-4">
      <PageHeader title="Projeção de receita" description="Quanto podemos faturar nos próximos 12 meses, a partir do que já fechou e do funil aberto. É estimativa: as chances e prazos abaixo são premissas iniciais que vocês ajustam com os números reais." />
      <div className="grid gap-3 sm:grid-cols-3">
        {d.projection.series.map((s) => (
          <div key={s.key} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs text-muted">Cenário {s.label.toLowerCase()} (chance × {SCENARIOS.find((x) => x.key === s.key)?.factor})</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{brl(s.mrrEndCents)}<span className="text-sm font-normal text-muted">/mês em 12 meses</span></p>
            <p className="mt-1 text-xs text-muted">{brl(s.revenueTotalCents)} faturados no período · {brl(s.mrrEndCents * 12)} por ano nesse ritmo</p>
          </div>
        ))}
      </div>
      <Card><CardHeader title="Receita mensal recorrente (MRR) por mês" description={`Parte de ${brl(d.wonMrrCents)}/mês já fechados e ${d.openCount} escritórios abertos (${brl(d.openValueCents)}/mês se todos fechassem; ponderado: ${brl(d.weightedCents)}).`} /><CardBody><ProjectionChart series={d.projection.series} months={d.projection.months} /></CardBody></Card>
      <Card><CardHeader title="Premissas" description="Cada escritório aberto entra com valor × chance, no mês em que se espera fechar. A chance e o fechamento previstos de cada escritório, quando preenchidos na ficha, valem no lugar destes padrões." /><CardBody>
        <SettingsForm probabilities={d.settings.probabilities} daysToClose={d.settings.daysToClose} churn={d.settings.churnMonthlyPct} canEdit={cx.role === "GERENTE"} />
      </CardBody></Card>
      {d.noValue > 0 ? <p className="text-sm text-warning">{d.noValue} escritórios abertos estão sem valor mensal previsto e não entram na conta. Preencha na ficha ou monte uma proposta.</p> : null}
    </div>
  );
}
