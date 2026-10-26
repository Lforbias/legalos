import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, ArrowUpRight } from "lucide-react";
import { requirePlatform } from "@/server/platform";
import { listCommercialProspects } from "@/server/services/prospecting.service";
import { STAGES } from "@/modules/prospecting/schema";
import { ProspectMap } from "@/modules/prospecting/prospect-map";

export const metadata: Metadata = { title: "Mapa de prospecção — LegalOS" };
export default async function ProspectingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { pc } = await requirePlatform();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const data = await listCommercialProspects(pc, { q: value("q"), neighborhood: value("bairro"), stage: value("etapa"), location: value("localizacao"), blocked: value("bloqueio"), page: Number(value("pagina")) });
  const pageUrl = (page: number) => { const p = new URLSearchParams(); for (const key of ["q", "bairro", "etapa", "localizacao", "bloqueio"]) if (value(key)) p.set(key, value(key)); p.set("pagina", String(page)); return `?${p}`; };
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href="/admin/comercial" className="text-xs text-muted hover:underline">← Visão comercial</Link><p className="mt-6 text-[11px] uppercase tracking-[.22em] text-muted">Inteligência de mercado</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Escritórios em São Paulo.</h1><p className="mt-2 text-sm text-muted">Amostra de até 200 escritórios · Capital · CNAE 6911-7/01</p></div>
      <a href="https://arquivos.receitafederal.gov.br/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs">Fonte: Receita Federal <ArrowUpRight size={14} /></a>
    </header>
    <section aria-label="Cobertura da base" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[['Cadastros na amostra', data.count.toLocaleString('pt-BR')], ['Localizados no mapa', data.located.toLocaleString('pt-BR')], ['Sem coordenadas', (data.count - data.located).toLocaleString('pt-BR')], ['Não contatar', data.blocked.toLocaleString('pt-BR')]].map(([label, count]) => <div key={label} className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums">{count}</p></div>)}
    </section>
    <form className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 xl:grid-cols-6">
      <label className="text-xs text-muted">Nome, CNPJ ou CEP<input name="q" defaultValue={value('q')} placeholder="Buscar escritório" className="mt-1 block w-full rounded-lg border border-border bg-bg p-2 text-sm text-fg" /></label>
      <label className="text-xs text-muted">Bairro<select name="bairro" defaultValue={value('bairro')} className="mt-1 block w-full rounded-lg border border-border bg-bg p-2 text-sm text-fg"><option value="">Todos os bairros</option>{data.neighborhoods.map(n => <option key={n}>{n}</option>)}</select></label>
      <label className="text-xs text-muted">Etapa<select name="etapa" defaultValue={value('etapa')} className="mt-1 block w-full rounded-lg border border-border bg-bg p-2 text-sm text-fg"><option value="">Todas as etapas</option>{Object.entries(STAGES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-xs text-muted">Localização<select name="localizacao" defaultValue={value('localizacao')} className="mt-1 block w-full rounded-lg border border-border bg-bg p-2 text-sm text-fg"><option value="">Todas</option><option value="located">Com coordenadas</option><option value="pending">Sem coordenadas</option></select></label>
      <label className="text-xs text-muted">Restrição<select name="bloqueio" defaultValue={value('bloqueio')} className="mt-1 block w-full rounded-lg border border-border bg-bg p-2 text-sm text-fg"><option value="">Todos</option><option value="yes">Não contatar</option><option value="no">Sem bloqueio</option></select></label>
      <div className="flex items-end gap-3"><button className="rounded-lg bg-fg px-4 py-2 text-sm text-bg">Filtrar</button><Link href="/admin/comercial/prospeccao" className="py-2 text-xs underline">Limpar</Link></div>
    </form>
    <ProspectMap points={data.points} />
    <p className="text-xs text-muted">{data.points.length.toLocaleString('pt-BR')} pontos exibidos de {data.locatedFiltered.toLocaleString('pt-BR')} localizados neste filtro. {data.locatedFiltered > 2000 ? 'O mapa exibe até 2.000 pontos; refine os filtros para explorar os demais.' : 'Pontos por CEP são aproximados e identificados na ficha.'} {data.latest.sourceMonth ? `Competência mais recente: ${data.latest.sourceMonth}.` : 'Aguardando a primeira importação oficial.'}</p>
    <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-labelledby="list-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-5"><h2 id="list-title" className="font-semibold">Cadastros encontrados</h2><span className="text-xs text-muted">{data.total.toLocaleString('pt-BR')} resultados · página {data.page} de {data.pages}</span></div>
      {!data.items.length ? <div className="p-10 text-center"><MapPin className="mx-auto mb-4 text-muted" /><h3 className="font-medium">{data.count ? 'Nenhum cadastro corresponde aos filtros.' : 'A base está sendo preparada.'}</h3><p className="mx-auto mt-2 max-w-lg text-sm text-muted">{data.count ? 'Ajuste a busca para explorar outros escritórios.' : 'A amostra da Receita precisa ser filtrada e importada. Nenhum escritório fictício foi adicionado ao mapa.'}</p></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-bg text-xs text-muted"><tr>{['Escritório / CNPJ', 'Bairro', 'Etapa', 'Localização', 'Contato'].map(h=><th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{data.items.map(p => <tr key={p.cnpj} className="border-t border-border hover:bg-bg"><td className="max-w-sm px-5 py-4"><Link href={`/admin/comercial/prospeccao/${p.cnpj}`} className="font-medium hover:underline">{p.legalName}</Link><p className="mt-1 text-xs text-muted">{p.cnpj} · Base {p.sourceMonth}</p></td><td className="px-5 py-4">{p.neighborhood || 'Não informado'}</td><td className="px-5 py-4">{STAGES[p.stage as keyof typeof STAGES] ?? p.stage}</td><td className="px-5 py-4 text-xs">{p.latitude === null ? 'Pendente' : p.locationAccuracy === 'POSTAL_CODE' ? 'Aproximada por CEP' : 'Endereço conferido'}</td><td className="px-5 py-4 text-xs">{p.doNotContact ? 'Não contatar' : p.contactVerified ? 'Conferido' : 'Não verificado'}</td></tr>)}</tbody></table></div>}
      <div className="flex justify-between border-t border-border p-4 text-sm">{data.page > 1 ? <Link href={pageUrl(data.page - 1)} className="underline">← Anterior</Link> : <span />}{data.page < data.pages && <Link href={pageUrl(data.page + 1)} className="underline">Próxima →</Link>}</div>
    </section>
    <p className="text-xs leading-relaxed text-muted">Amostra dos primeiros 200 estabelecimentos elegíveis encontrados no arquivo oficial; não representa o total da cidade. Origem cadastral: Receita Federal. Telefones e e-mails podem pertencer ao contador; confira o vínculo antes de abordar. Esta área registra a prospecção e não envia mensagens. Cadastros com competência anterior podem ter mudado de situação. Não são importados dados de sócios.</p>
  </div>;
}
