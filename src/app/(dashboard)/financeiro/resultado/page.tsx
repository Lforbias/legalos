import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { isYmd, todayYmd } from "@/lib/dates/ymd";
import { formatMoneyBR } from "@/lib/validation/money";
import { FinanceNav } from "@/modules/finance/finance-nav";
import { can } from "@/server/context";
import { monthlyCostCenterResult } from "@/server/services/finance-report.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Resultado por centro de custo" };

export default async function FinanceResultPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:read")) return <AccessDenied />;
  const { mes } = await searchParams;
  const month = typeof mes === "string" && /^\d{4}-\d{2}$/.test(mes) && isYmd(`${mes}-01`)
    ? mes : todayYmd(ctx.timezone).slice(0, 7);
  const rows = await monthlyCostCenterResult(ctx, month);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Resultado por centro de custo" description="Compare o que foi lançado no mês com o que efetivamente entrou ou saiu do caixa." />
      <FinanceNav current="resultado" />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="finance-month" className="text-sm">Mês</label>
        <Input type="month" id="finance-month" name="mes" defaultValue={month} required className="w-auto" />
        <Button type="submit" size="sm">Consultar</Button>
      </form>
      <Card>
        <CardHeader title="Lançado e realizado" description="Lançado usa a data de emissão dos registros ativos. Realizado usa a data de baixa e exclui estornos." />
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm tabular-nums">
            <thead className="text-right text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-left">Centro de custo</th>
                <th scope="col" className="px-3 py-2">A receber lançado</th>
                <th scope="col" className="px-3 py-2">A pagar lançado</th>
                <th scope="col" className="px-3 py-2">Resultado lançado</th>
                <th scope="col" className="px-3 py-2">Recebido</th>
                <th scope="col" className="px-3 py-2">Pago</th>
                <th scope="col" className="px-4 py-2">Resultado de caixa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-muted">Sem lançamentos ou baixas neste mês.</td></tr> : null}
              {rows.map((row) => (
                <tr key={row.id ?? "sem-centro"} className="text-right">
                  <th scope="row" className="px-4 py-2 text-left font-medium">{row.name}</th>
                  <td className="px-3 py-2">{formatMoneyBR(row.issuedIn)}</td>
                  <td className="px-3 py-2">{formatMoneyBR(row.issuedOut)}</td>
                  <td className="px-3 py-2 font-medium">{formatMoneyBR(row.issuedNet)}</td>
                  <td className="px-3 py-2">{formatMoneyBR(row.received)}</td>
                  <td className="px-3 py-2">{formatMoneyBR(row.paid)}</td>
                  <td className="px-4 py-2 font-medium">{formatMoneyBR(row.cashNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
