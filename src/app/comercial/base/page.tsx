import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { formatCnpj } from "@/lib/validation/br-documents";
import { AddBaseSample } from "@/modules/comercial/add-base-sample";
import { AddFromBase } from "@/modules/comercial/add-from-base";
import { requireComercial } from "@/server/comercial";
import { searchBase } from "@/server/services/comercial.service";

export const metadata: Metadata = { title: "LegalOS Comercial — base da Receita" };
export const dynamic = "force-dynamic";

export default async function BasePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { cx } = await requireComercial();
  const { total, rows } = await searchBase(cx, q, 30);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Base da Receita"
        description="Escritórios de advocacia já importados da base pública (Receita Federal). Escolha um e leve para o funil com um clique: o telefone, o endereço, o ponto no mapa e a marca de “não contatar” vão junto."
        actions={cx.isPlatformAdmin ? <Link href="/admin/comercial/prospeccao" className="text-sm underline">Mapa e conferência da base</Link> : undefined}
      />
      {cx.role === "GERENTE" && total > 0 ? <AddBaseSample /> : null}
      <form className="flex gap-2" role="search">
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por razão social, nome fantasia ou CNPJ" aria-label="Buscar na base" className="max-w-xl" />
        <Button type="submit">Buscar</Button>
      </form>
      <Card>
        <CardHeader title={`${total.toLocaleString("pt-BR")} escritórios na base`} description={q ? `Resultado para “${q}” (até 30).` : "Mostrando os primeiros por ordem alfabética. Use a busca para achar um escritório."} />
        <CardBody>
          {total === 0 ? <p className="text-sm text-muted">A base ainda está vazia. A importação é feita pela administração do LegalOS.</p> : null}
          {total > 0 && rows.length === 0 ? <p className="text-sm text-muted">Nada encontrado.</p> : null}
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.cnpj} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{r.tradeName || r.legalName} {r.doNotContact ? <Badge tone="danger">não contatar</Badge> : null} {r.latitude != null ? null : <span className="text-[11px] text-muted">(sem mapa)</span>}</p>
                  <p className="text-xs text-muted">{formatCnpj(r.cnpj)} · {r.neighborhood || "bairro não informado"} · {r.phone || "sem telefone"} · competência {r.sourceMonth}</p>
                </div>
                {r.funnelId ? <Link className="text-sm underline" href={`/comercial/escritorios/${r.funnelId}`}>Já está no funil</Link> : <AddFromBase cnpj={r.cnpj} />}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
