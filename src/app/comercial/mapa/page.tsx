import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { isStageKey } from "@/lib/comercial/stages";
import { GeocodePending } from "@/modules/comercial/geocode-pending";
import { ProspectMap } from "@/modules/comercial/prospect-map";
import { requireComercial } from "@/server/comercial";
import { mapPoints } from "@/server/services/comercial.service";

export const metadata: Metadata = { title: "LegalOS Comercial — mapa" };
export const dynamic = "force-dynamic";

export default async function MapPage({ searchParams }: { searchParams: Promise<{ top?: string; stage?: string }> }) {
  const sp = await searchParams;
  const { cx } = await requireComercial();
  const top = sp.top === "1";
  const { points, withoutCoords } = await mapPoints(cx, { top, stage: isStageKey(sp.stage) ? sp.stage : undefined });
  return (
    <div className="space-y-4">
      <PageHeader title="Mapa dos escritórios" description="Cada ponto é um escritório, na cor da etapa do funil. Clique para ver o resumo e abrir a ficha." actions={<Link href={top ? "/comercial/mapa" : "/comercial/mapa?top=1"} className="text-sm underline">{top ? "Mostrar todos" : "Só a lista dos 100"}</Link>} />
      <Link href="/comercial/base" className="inline-block text-sm underline">Abrir a amostra da Receita e adicionar ao Comercial →</Link>
      <GeocodePending missing={withoutCoords} />
      {points.length === 0 ? <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">Nenhum ponto ainda. Importe escritórios ou adicione pelo CNPJ; Depois, use “Localizar 8 agora” para consultar os endereços. Nem todo endereço pode ser localizado.</p> : null}
      <ProspectMap points={points} />
    </div>
  );
}
