import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatMoneyBR } from "@/lib/validation/money";
import { formatYmd } from "@/lib/dates/ymd";
import { CALC_KINDS, CALC_KIND_LABEL } from "@/modules/calculos/schemas";
import { can } from "@/server/context";
import { listCalculations } from "@/server/services/calculation.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Cálculos" };

const DESC: Record<(typeof CALC_KINDS)[number], string> = {
  JF_ATRASADOS: "INPC até 06/2009 e SELIC depois, com juros de 1% desde a citação nas parcelas antigas.",
  TJSP: "Tabela Prática com 1% ao mês, só SELIC ou híbrido, conforme a sentença.",
  TRABALHISTA: "ADC 58: IPCA-E e juros antes do ajuizamento, SELIC depois. Honorários e custas.",
  RESCISAO: "Saldo, aviso, 13º, férias, multa do FGTS e multas dos arts. 477 e 467.",
  PRAZO: "Prazo por ato (CPC, JEC e CLT) com alertas sugeridos.",
};

export default async function CalculosPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const rows = await listCalculations(ctx);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Cálculos" description="Calculadoras do escritório. Ferramenta de apoio: confira o resultado com a decisão e, quando exigido, com o cálculo oficial do juízo." actions={<Link href="/calculos/indices" className={buttonVariants({ variant: "secondary" })}>Índices</Link>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CALC_KINDS.map((k) => (
          <Link key={k} href={`/calculos/novo?tipo=${k}`} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary">
            <p className="text-sm font-semibold">{CALC_KIND_LABEL[k]}</p>
            <p className="mt-1 text-xs text-muted">{DESC[k]}</p>
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader title="Cálculos salvos" />
        <CardBody>
          {rows.length === 0 ? <p className="text-sm text-muted">Nenhum cálculo salvo ainda.</p> : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/calculos/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                  <span className="text-xs text-muted">{r.kindLabel} · {formatYmd(r.createdAt.toISOString().slice(0, 10))}{r.kind !== "PRAZO" ? ` · ${formatMoneyBR(r.total)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
