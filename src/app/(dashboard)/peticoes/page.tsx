import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { formatDateTime } from "@/lib/dates/format";
import { getPetitioningAdapter } from "@/lib/petitioning/adapter";
import { petitionStateInfo } from "@/lib/judicial/petition-state";
import { PETITION_STATUS_LABEL } from "@/modules/petitions/schemas";
import { can } from "@/server/context";
import { listPetitions, PETITION_STATUSES } from "@/server/services/petition.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Peticionamento" };

export default async function PetitionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "petitions:read")) return <AccessDenied />;
  const sp = await searchParams;
  const result = await listPetitions(ctx, { status: sp.status });
  const adapter = getPetitioningAdapter();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Peticionamento"
        description="Preparação, revisão e aprovação de petições antes do envio."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/peticoes/fila" className={bv({ variant: "secondary" })}>Fila de protocolos</Link>
            {can(ctx, "petitions:write") ? (
              <Link href="/peticoes/nova" className={bv({})}>
                <Plus className="h-4 w-4" aria-hidden /> Nova petição
              </Link>
            ) : null}
          </div>
        )}
      />
      {adapter.isDemo ? (
        <Alert tone="warning" className="mb-4">
          Modo de demonstração: o envio é apenas simulado e <strong>não protocola nada em nenhum tribunal</strong>. O protocolo de verdade deve ser feito no sistema do tribunal. Integrações reais estão previstas para a Fase 8.
        </Alert>
      ) : null}
      <form method="get" className="mb-4 flex items-center gap-2" role="search" aria-label="Filtrar petições">
        <label htmlFor="status" className="sr-only">Situação</label>
        <Select id="status" name="status" defaultValue={sp.status ?? ""} className="w-52">
          <option value="">Todas as situações</option>
          {PETITION_STATUSES.map((s) => (
            <option key={s} value={s}>{PETITION_STATUS_LABEL[s]}</option>
          ))}
        </Select>
        <button type="submit" className={bv({ variant: "secondary" })}>Filtrar</button>
      </form>
      {result.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nenhuma petição encontrada.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de petições</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Petição</th>
                <th scope="col" className="px-3 py-2 font-medium">Processo</th>
                <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                <th scope="col" className="px-3 py-2 font-medium">Atualizada</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/peticoes/${p.id}`} className="font-medium text-primary-text hover:underline">{p.title}</Link>
                    {p.kind ? <p className="text-xs text-muted">{p.kind}</p> : null}
                  </td>
                  <td className="px-3 py-2"><Link href={`/processos/${p.case.id}`} className="hover:underline">{p.case.title}</Link></td>
                  <td className="px-3 py-2">
                    {(() => { const i = petitionStateInfo(p.status, p.filingEnvironment, p.isDemo); return <Badge tone={i.tone}>{i.label}</Badge>; })()}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{formatDateTime(p.updatedAt, organization.timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
