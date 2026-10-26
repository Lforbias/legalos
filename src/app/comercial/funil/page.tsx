import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { brl, dateBR } from "@/lib/comercial/format";
import { STAGE_INFO, STAGE_KEYS, type StageKey } from "@/lib/comercial/stages";
import { StageSelect } from "@/modules/comercial/stage-select";
import { requireComercial } from "@/server/comercial";
import { listProspects, ownersForSelect } from "@/server/services/comercial.service";

export const metadata: Metadata = { title: "LegalOS Comercial — funil" };
export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const { cx } = await requireComercial();
  const [owners, ...cols] = await Promise.all([ownersForSelect(cx), ...STAGE_KEYS.map((k) => listProspects(cx, { stage: k, pageSize: 50 }))]);
  const name = new Map(owners.map((o) => [o.id, o.name]));
  // eslint-disable-next-line react-hooks/purity -- página de servidor renderizada a cada requisição: precisa da hora atual para marcar retornos atrasados.
  const now = Date.now();
  return (
    <div className="space-y-4">
      <PageHeader title="Funil de vendas" description="Cada coluna é uma etapa. Troque a etapa pelo seletor do cartão. Perdido pede o motivo; Ganho pede o valor mensal fechado. Aparecem até 50 por coluna; veja o resto em Escritórios." />
      <div className="flex gap-3 overflow-x-auto pb-3">
        {STAGE_KEYS.map((k, i) => {
          const col = cols[i]!;
          const total = col.rows.reduce((s, r) => s + (r.expectedMonthlyCents ?? 0), 0);
          return (
            <section key={k} aria-label={STAGE_INFO[k].label} className="w-72 shrink-0 rounded-lg border border-border bg-surface-2/60">
              <header className="border-b border-border p-3" style={{ borderTopColor: STAGE_INFO[k].color, borderTopWidth: 3, borderTopStyle: "solid", borderRadius: "0.5rem 0.5rem 0 0" }}>
                <h2 className="text-sm font-semibold">{STAGE_INFO[k].label} <span className="font-normal text-muted">({col.total})</span></h2>
                <p className="text-xs text-muted">{STAGE_INFO[k].hint}</p>
                <p className="mt-0.5 text-xs tabular-nums text-muted">{brl(total)}/mês</p>
              </header>
              <div className="space-y-2 p-2">
                {col.rows.length === 0 ? <p className="p-2 text-xs text-muted">Vazio.</p> : null}
                {col.rows.map((r) => (
                  <article key={r.id} className="space-y-2 rounded-md border border-border bg-surface p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/comercial/escritorios/${r.id}`} className="text-sm font-medium leading-snug hover:underline">{r.name}</Link>
                      {r.rankingPosition ? <Badge tone="accent">#{r.rankingPosition}</Badge> : null}
                    </div>
                    <p className="text-xs text-muted">{r.district ?? "—"} · {r.ownerId ? name.get(r.ownerId) ?? "—" : "Sem responsável"}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="tabular-nums">{brl(r.expectedMonthlyCents)}/mês</span>
                      {r.nextActionAt ? <span className={r.nextActionAt.getTime() < now && k !== "GANHO" && k !== "PERDIDO" ? "font-medium text-danger" : "text-muted"}>retorno {dateBR(r.nextActionAt)}</span> : null}
                    </div>
                    <StageSelect id={r.id} stage={r.stage as StageKey} expectedCents={r.expectedMonthlyCents} compact />
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
