import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, ExternalLink, Minus } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { COMPETITORS, COMPARISON_LABELS, COMPARISON_ROWS, LEGALOS_PLANS, PRICING_CHECKED_AT, formatBRL, publishedPlanAverage, type ComparisonCell } from "@/config/pricing";
import { PRICING_FEATURES } from "@/config/pricing-features";
import { SectionTitle } from "../_parts";
import { FeatureCatalogue } from "./feature-catalogue";

export const metadata: Metadata = {
  title: "Preços e comparativo",
  description: "Compare os preços públicos de LegalMail, ADVBOX, Astrea e ChatGuru e conheça os recursos e a estrutura de planos do LegalOS. Planos LegalOS a partir de R$ 79 por mês.",
};

function Status({ value }: { value: ComparisonCell }) {
  return <span className={`inline-flex items-center gap-1.5 text-xs ${value === "unknown" ? "text-muted" : value === "validation" ? "text-amber-800" : "text-fg"}`}>
    {value === "yes" ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden /> : value === "unknown" ? <Minus className="h-3 w-3 shrink-0" aria-hidden /> : null}{COMPARISON_LABELS[value]}
  </span>;
}

export default function PricingPage() {
  const featureCount = PRICING_FEATURES.reduce((sum, g) => sum + g.features.length, 0);
  return <>
    <section className="force-dark relative overflow-hidden bg-[#0a0c13] text-white">
      <div className="prod-grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 md:pt-28">
        <p className="text-xs font-medium uppercase tracking-[.22em] text-white/50">Preços & possibilidades</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-medium leading-[1.04] tracking-tight md:text-7xl">Antes do preço,<br /><span className="text-white/50">olhe o que se conecta.</span></h1>
        <div className="mt-8 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <p className="max-w-xl text-lg leading-relaxed text-white/65">Gestão jurídica, intimações, atendimento e inteligência no mesmo ecossistema. Compare as propostas e descubra o que faz sentido para o seu escritório.</p>
          <a href="#planos" className="inline-flex w-fit items-center gap-3 rounded-full bg-white px-7 py-4 text-sm font-semibold text-black transition hover:bg-white/90">Ver planos LegalOS <ArrowDown className="h-4 w-4" aria-hidden /></a>
        </div>
        <div className="mt-16 grid gap-5 border-t border-white/15 pt-7 sm:grid-cols-3">
          <div><p className="text-3xl font-medium">{featureCount}</p><p className="mt-1 text-sm text-white/55">recursos e operações catalogados</p></div>
          <div><p className="text-3xl font-medium">Um ecossistema</p><p className="mt-1 text-sm text-white/55">Func · Chat · RUTE · Desktop</p></div>
          <div><p className="text-3xl font-medium">4 planos</p><p className="mt-1 text-sm text-white/55">a partir de R$ 79 por mês</p></div>
        </div>
      </div>
    </section>

    <section id="mercado" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-24">
      <SectionTitle eyebrow="O mercado, com contexto" title="Propostas diferentes. Custos diferentes." text="Valores públicos consultados nas páginas oficiais. Cada produto tem seu próprio foco, limites e condições de contratação." />
      <p className="mt-5 text-xs text-muted">Conferido em {PRICING_CHECKED_AT}. Os preços podem mudar; consulte a oferta vigente na fonte.</p>
      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COMPETITORS.map(c => <article key={c.id} className="flex flex-col rounded-3xl border border-border bg-surface p-6" data-testid={`competitor-${c.id}`}>
          <div className="flex h-14 items-center"><Image src={`/produto/concorrentes/${c.id}.png`} alt={`Logo ${c.name}`} width={112} height={42} unoptimized className={`h-10 w-[112px] object-contain object-left opacity-70 grayscale [image-rendering:pixelated] ${c.id === "advbox" ? "brightness-0" : ""}`} /></div>
          <h2 className="mt-5 text-xl font-semibold">{c.name}</h2><p className="mt-1 min-h-10 text-sm text-muted">{c.focus}</p>
          <p className="mt-7 text-3xl font-medium tracking-tight">{formatBRL(c.price)}</p><p className="mt-1 text-xs text-muted">{c.basis}</p>
          <ul className="mt-6 space-y-2 text-sm">{c.includes.map(item => <li key={item} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />{item}</li>)}</ul>
          <details className="mt-6 border-y border-border py-3"><summary className="cursor-pointer text-xs font-medium">Planos e valores publicados</summary><dl className="mt-4 space-y-2">{c.plans.map(p => <div key={p.name} className="flex justify-between gap-3 text-xs"><dt>{p.name}</dt><dd className="text-right">{p.value === null ? "Sob consulta" : formatBRL(p.value)}</dd></div>)}</dl></details>
          <p className="mt-4 text-xs leading-relaxed text-muted">{c.limits}</p>
          <div className="mt-5 rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Média dos planos publicados</p><p className="mt-1 text-lg font-medium">{publishedPlanAverage(c.plans) === null ? "Não calculável" : formatBRL(publishedPlanAverage(c.plans)!)}</p><p className="mt-2 text-xs leading-relaxed text-muted">{c.note}</p></div>
          <a href={c.source} target="_blank" rel="noopener noreferrer" className="mt-auto flex items-center gap-2 pt-6 text-xs font-medium underline underline-offset-4">Conferir fonte oficial <ExternalLink className="h-3 w-3" aria-hidden /></a>
        </article>)}
      </div>
      <p className="mt-5 max-w-4xl text-xs leading-relaxed text-muted">As médias são descritivas e não ponderadas. Planos com quantidades diferentes de usuários, processos e canais não são equivalentes. Não somamos esses preços como se fossem uma contratação obrigatória, nem tratamos a diferença de preço como equivalência entre produtos. Marcas pertencem aos respectivos titulares; apresentação apenas para identificação comparativa.</p>
    </section>

    <section className="border-y border-border bg-surface-2/60 py-24" id="comparativo">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><SectionTitle eyebrow="Lado a lado" title="Compare a cobertura da sua rotina." text="A tabela considera recursos anunciados, que podem depender do plano. “Não confirmado” significa que a fonte consultada não permite concluir; não significa ausência." /><a href="#planos" className="inline-flex shrink-0 items-center gap-2 text-sm font-medium underline underline-offset-4">Ir aos planos <ArrowDown className="h-4 w-4" aria-hidden /></a></div>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-border bg-surface" role="region" aria-label="Comparativo de recursos por plataforma" tabIndex={0}>
          <table className="w-full min-w-[980px] border-collapse text-left"><caption className="sr-only">Cobertura divulgada pelas plataformas e disponibilidade atual do LegalOS</caption><thead><tr className="border-b border-border"><th scope="col" className="w-[25%] p-5 text-xs font-medium text-muted">Recurso</th><th scope="col" className="bg-fg p-5 text-sm font-medium text-bg">LegalOS</th>{COMPETITORS.map(c => <th scope="col" key={c.id} className="p-5 text-sm font-medium">{c.name}</th>)}</tr></thead><tbody>{COMPARISON_ROWS.map(row => <tr key={row.label} className="border-b border-border last:border-0"><th scope="row" className="p-5 text-sm font-normal">{row.label}</th><td className="bg-surface-2 p-5"><Status value={row.legalos} /></td>{COMPETITORS.map(c => <td key={c.id} className="p-5"><Status value={row[c.id]} /></td>)}</tr>)}</tbody></table>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">{COMPARISON_ROWS.filter(r => r.note).map(r => <p key={r.label} className="text-xs leading-relaxed text-muted"><span className="font-medium text-fg">{r.label}: </span>{r.note}</p>)}</div>
        <p className="mt-6 text-xs text-muted">Critério: fontes de planos acima; não é uma auditoria exaustiva dos produtos concorrentes. Itens externos do LegalOS também têm requisitos e limites. A ausência de recursos nos planos de terceiros só é afirmada quando documentada; aqui, lacunas de evidência permanecem identificadas.</p>
        <p className="mt-3 text-xs text-muted">Fontes adicionais de integração: <a className="underline underline-offset-4" href="https://intercom.help/techlegal-3fdecf68cb67/pt-BR/articles/14239808-api-publica-legalmail-guia-completo-de-integracao" target="_blank" rel="noopener noreferrer">API pública LegalMail</a> e <a className="underline underline-offset-4" href="https://chatguru.com.br/" target="_blank" rel="noopener noreferrer">integrações ChatGuru</a>.</p>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-24" id="recursos">
      <SectionTitle eyebrow="O LegalOS em detalhe" title={<>{featureCount} recursos e operações.<br />Encontre o que importa para você.</>} text="Explore o catálogo por área ou procure uma necessidade específica. São ações e recursos granulares da plataforma — consultar, criar e editar são contados separadamente, não como módulos independentes." />
      <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted">O catálogo descreve a base atual do produto. Não significa que todos os itens estarão em todos os planos, disponíveis pela RUTE ou liberados sem configuração. Os recursos disponíveis variam conforme o plano e as integrações configuradas.</p>
      <FeatureCatalogue groups={PRICING_FEATURES.map(g => ({ name: g.name, condition: g.condition, features: g.features.map(({ id, label }) => ({ id, label })) }))} />
    </section>

    <section id="planos" className="force-dark scroll-mt-28 bg-[#0a0c13] px-4 py-24 text-white" data-testid="legalos-plans">
      <div className="mx-auto max-w-7xl">
        <Brand /><p className="mt-10 text-xs uppercase tracking-[.2em] text-white/50">Planos LegalOS</p>
        <h2 className="mt-4 text-4xl font-medium tracking-tight md:text-6xl">Um começo simples.<br /><span className="text-white/50">Espaço para evoluir.</span></h2>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/65">Quatro níveis para diferentes momentos do escritório. Escolha a estrutura que acompanha o tamanho da sua equipe e o volume de processos da sua operação.</p>
        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{LEGALOS_PLANS.map(p => <article key={p.id} className={`flex flex-col rounded-3xl border p-6 ${p.featured ? "border-white/60 bg-white/[.08]" : "border-white/15 bg-white/[.025]"}`}>
          <p className="text-[10px] uppercase tracking-[.18em] text-white/45">{p.featured ? "Foco em equipes" : "Plano mensal"}</p><h3 className="mt-5 text-2xl font-medium">{p.name}</h3><p className="mt-2 min-h-12 text-sm text-white/60">{p.subtitle}</p><p className="mt-7 text-3xl font-medium">{formatBRL(p.price)}<span className="ml-1 text-sm font-normal text-white/50">/mês</span></p><ul className="mt-4 space-y-2 text-sm text-white/80"><li>{p.users} usuários</li><li>Até {p.processes.toLocaleString("pt-BR")} processos</li>{p.whatsappNumbers !== null && <li>{p.whatsappNumbers} {p.whatsappNumbers === 1 ? "número de WhatsApp" : "números de WhatsApp"}</li>}</ul><p className="mt-7 min-h-16 text-sm leading-relaxed text-white/65">{p.audience}</p>
          <p className="mt-5 text-xs font-medium text-white/80">Foco do plano</p><ul className="mt-4 space-y-3 text-sm text-white/65">{p.focus.map(f => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />{f}</li>)}</ul><Link href="/produto/contato" className="mt-auto flex items-center justify-between gap-2 border-t border-white/15 pt-5 text-sm font-medium">Conversar sobre os planos <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </article>)}</div>
        <p className="mt-7 max-w-4xl text-xs leading-relaxed text-white/50">Valores mensais em reais. Serviços de IA, WhatsApp, pagamentos e integrações podem ter custos de terceiros, conforme o uso e o provedor. Consulte as condições de contratação e de implantação.</p>
      </div>
    </section>
  </>;
}
