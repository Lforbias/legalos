import { ArrowRight, BellRing, CalendarClock, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { COMING_SOON, FACTS, RUTE_INFO, HONESTY, INTEGRATIONS, MODULES, PWA, SPACES } from "@/config/showcase";
import { PHASES_2 } from "@/lib/updates";
import { CtaLink, Eyebrow, SectionTitle } from "./_parts";
import { ModuleTabs, Reveal } from "./showcase-client";
import { ProductHero } from "./product-hero";
import { DesktopShowcase } from "./desktop-showcase";

export const dynamic = "force-dynamic";

const STATS = [
  { n: String(FACTS.spaces), label: "espaços integrados", sub: "Func e Chat" },
  { n: String(FACTS.permissions), label: "permissões granulares", sub: "mínimo de acesso por padrão" },
  { n: `${FACTS.tests}+`, label: "testes automatizados", sub: `mais ${FACTS.e2e} testes de ponta a ponta` },
  { n: `${FACTS.tables}`, label: "estruturas de dados", sub: "tudo isolado por escritório" },
];

const DAY = [
  { t: "08:02", icon: CalendarClock, title: "Organize o dia", text: "Confira os compromissos e as tarefas do escritório." },
  { t: "08:03", icon: Sparkles, title: "Vai para quem trata", text: "A tarefa é atribuída à pessoa responsável pelo caso." },
  { t: "08:10", icon: CalendarClock, title: "Vira prazo", text: "O prazo é calculado, fica como rascunho e só vale depois de conferido por uma pessoa." },
  { t: "09:30", icon: MessageCircle, title: "O cliente pergunta", text: "A conversa de WhatsApp já mostra o processo, as tarefas e o financeiro daquele cliente." },
  { t: "17:00", icon: BellRing, title: "Nada se perde", text: "Prazos e tarefas do dia aparecem para cada pessoa, com aviso dentro do sistema." },
];

export default function ProdutoHome() {
  const upcoming = [...PHASES_2.filter((p) => p.status !== "feita").map((p) => p.title), ...COMING_SOON].slice(0, 10);
  return (
    <>
      {/* HERO — escuro */}
      <section className="force-dark relative overflow-hidden text-fg" style={{ background: "#08090b", color: "#f5f5f7" }}>
        <div className="prod-grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="prod-glow pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[#ffe168]/10 blur-[120px]" aria-hidden />
        <div className="prod-glow pointer-events-none absolute top-40 -right-40 h-[420px] w-[420px] rounded-full bg-white/5 blur-[110px]" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 md:pt-24">
          <div className="prod-hero-in mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" aria-hidden /> Feito dentro de um escritório de advocacia, para escritórios de advocacia
            </span>
            <h1 className="mt-7 text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">
              O escritório inteiro.<br /><span style={{ background: "linear-gradient(110deg, #fff 15%, #ffe168 85%)", backgroundClip: "text", color: "transparent" }}>Num só sistema.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70 md:text-xl">
              Processos, tarefas, prazos, financeiro e WhatsApp conversando entre si. Menos aba aberta, menos prazo na cabeça, mais tempo para advogar.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <CtaLink variant="solid" />
              <Link href="/produto/recursos" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/10">Ver os recursos</Link>
              <Link href="/produto/precos" className="inline-flex h-11 items-center gap-2 px-4 text-sm font-medium text-white/75 underline underline-offset-4 transition hover:text-white">Comparar recursos e planos</Link>
            </div>
          </div>

          <ProductHero />
          <p className="mt-5 text-center text-[11px] text-white/40">Composição ilustrativa do ecossistema com tela real e dados fictícios.</p>
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 py-12 md:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 80} className="px-4 py-2 text-center">
              <p className="text-4xl font-semibold tracking-tight md:text-5xl">{s.n}</p>
              <p className="mt-1 text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted">{s.sub}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* PROBLEMA */}
      <section className="mx-auto max-w-5xl px-4 py-24 text-center">
        <Reveal>
          <h2 className="text-3xl font-semibold leading-[1.15] tracking-tight md:text-6xl">
            Planilha aqui. <span className="text-muted">WhatsApp ali.</span> Prazo <span className="text-muted">na cabeça.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
            O escritório funciona quando tudo conversa. No LegalOS, o processo reúne os prazos, a tarefa aparece na conversa do cliente e o honorário fica no processo.
          </p>
        </Reveal>
      </section>

      {/* ESPAÇOS */}
      <section className="mx-auto max-w-7xl px-4 pb-24">
        <SectionTitle center eyebrow="Três espaços, um só sistema" title="Cada rotina no seu lugar. Tudo ligado." />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {SPACES.map((s, i) => (
            <Reveal key={s.name} delay={i * 100}>
              <article className="group relative h-full overflow-hidden rounded-3xl border border-border bg-surface p-7 transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/10">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-3xl transition group-hover:opacity-40" style={{ background: s.tone }} aria-hidden />
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: s.tone }} aria-hidden><ShieldCheck className="h-5 w-5" /></span>
                <h3 className="relative mt-5 text-xl font-semibold">{s.name}</h3>
                <p className="relative mt-2 text-sm text-muted">{s.text}</p>
                <ul className="relative mt-5 space-y-2 text-sm">
                  {s.items.map((it) => <li key={it} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: s.tone }} aria-hidden />{it}</li>)}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal delay={300}>
          <article className="force-dark relative mt-5 overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0f] p-7 text-fg md:p-9" data-testid="future-ai">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ background: RUTE_INFO.tone }} aria-hidden />
            <div className="relative grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
              <div>
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 48 48" width="44" height="44" role="img" aria-label="Logotipo da RUTE" className="shrink-0">
                    <rect width="48" height="48" rx="12" fill="#0b0b0f" stroke="#ffffff" strokeOpacity="0.25" />
                    <path d="M24 9 L27.2 20.8 L39 24 L27.2 27.2 L24 39 L20.8 27.2 L9 24 L20.8 20.8 Z" fill="#ffffff" />
                    <circle cx="36" cy="12" r="4" fill={RUTE_INFO.tone} />
                  </svg>
                  <h3 className="text-2xl font-semibold">{RUTE_INFO.name}</h3>
                  <span className="rounded-full border border-white/25 px-2.5 py-0.5 text-xs font-medium" style={{ color: "#7ee0a0" }}>Disponível</span>
                </div>
                <p className="mt-4 max-w-xl text-sm text-muted">{RUTE_INFO.text}</p>
                <p className="mt-3 text-xs text-muted">Nasce desligada em cada escritório e só funciona com a chave real do provedor e a autorização de quem administra.</p>
              </div>
              <ul className="space-y-2.5 text-sm">
                {RUTE_INFO.items.map((it) => <li key={it} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: RUTE_INFO.tone }} aria-hidden />{it}</li>)}
              </ul>
            </div>
          </article>
        </Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12"><Link href="/produto/novidades" className="block rounded-2xl border border-border bg-surface p-6 transition hover:bg-surface-2"><p className="text-xs uppercase tracking-widest text-muted">Novidades do Chat</p><h2 className="mt-3 text-2xl font-semibold tracking-tight">WhatsApp, e-mail e um copiloto para a equipe.</h2><p className="mt-3 text-sm text-muted">Conheça as novas rotinas de atendimento, campanhas, API e o que precisa ser configurado no seu escritório.</p><span className="mt-4 inline-block text-sm font-medium">Ver a atualização →</span></Link></section>
      <DesktopShowcase />

      {/* MÓDULOS */}
      <section className="border-y border-border bg-surface-2/60 py-24">
        <div className="mx-auto max-w-7xl px-4">
          <SectionTitle center eyebrow="O produto por dentro" title="Veja o sistema de verdade." text="Estas são telas reais do LegalOS, com dados de demonstração. Nenhum cliente real aparece aqui." />
          <div className="mt-12"><ModuleTabs modules={MODULES} /></div>
          <p className="mt-10 text-center"><Link href="/produto/recursos" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-text hover:underline">Todos os recursos <ArrowRight className="h-4 w-4" aria-hidden /></Link></p>
        </div>
      </section>

      {/* UM DIA */}
      <section className="mx-auto max-w-5xl px-4 py-24">
        <SectionTitle eyebrow="Exemplo ilustrativo" title="Um dia no escritório, sem perder o fio." />
        <ol className="relative mt-12 space-y-8 border-l border-border pl-8">
          {DAY.map((d, i) => (
            <Reveal key={d.t} delay={i * 70}>
              <li className="relative">
                <span className="absolute -left-[3.05rem] flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-primary-text shadow-sm"><d.icon className="h-4 w-4" aria-hidden /></span>
                <p className="font-mono text-xs text-muted">{d.t}</p>
                <h3 className="text-lg font-semibold">{d.title}</h3>
                <p className="mt-1 text-sm text-muted">{d.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* PRINCÍPIOS */}
      <section className="border-y border-border bg-surface py-24">
        <div className="mx-auto max-w-7xl px-4">
          <SectionTitle center eyebrow="Princípios" title="Honesto. Privado. Sob o seu controle." />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {HONESTY.map((h, i) => (
              <Reveal key={h.title} delay={i * 90}>
                <article className="h-full rounded-3xl border border-border bg-bg p-7">
                  <h3 className="text-lg font-semibold">{h.title}</h3>
                  <p className="mt-2 text-sm text-muted">{h.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <p className="mt-10 text-center"><Link href="/produto/seguranca" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-text hover:underline">Como protegemos os dados do escritório <ArrowRight className="h-4 w-4" aria-hidden /></Link></p>
        </div>
      </section>

      {/* INTEGRAÇÕES */}
      <section className="overflow-hidden py-20" aria-label="Integrações">
        <div className="mx-auto max-w-7xl px-4"><SectionTitle center eyebrow="Conecta com o que você já usa" title="Integrações" /></div>
        <div className="relative mt-10">
          <div className="prod-marquee flex w-max gap-4 whitespace-nowrap">
            {[...INTEGRATIONS, ...INTEGRATIONS].map((x, i) => (
              <span key={i} className="rounded-full border border-border bg-surface px-6 py-3 text-sm font-medium shadow-sm" aria-hidden={i >= INTEGRATIONS.length}>
                {x.name}{x.note ? <span className="ml-2 text-xs font-normal text-muted">({x.note})</span> : null}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* O QUE VEM */}
      <section className="mx-auto max-w-5xl px-4 py-24" data-testid="produto-pwa">
        <SectionTitle eyebrow="Aplicativo" title={PWA.title} text={PWA.text} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {PWA.points.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-muted">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24">
        <SectionTitle eyebrow="Em construção" title="E o sistema continua evoluindo." text="Próximas entregas já planejadas:" />
        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {upcoming.map((t) => (
            <li key={t} className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden /> {t}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm"><Link href="/produto/roadmap" className="font-semibold text-primary-text hover:underline">Ver tudo o que já temos e tudo o que estamos construindo →</Link></p>
      </section>

      {/* CTA FINAL — escuro */}
      <section className="force-dark relative overflow-hidden bg-[#0a0c13] text-fg">
        <div className="prod-glow pointer-events-none absolute left-1/2 top-0 h-[360px] w-[760px] -translate-x-1/2 rounded-full bg-[#FF3B4E]/25 blur-[120px]" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center">
          <Eyebrow>Vamos conversar</Eyebrow>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">Conheça o LegalOS <span className="prod-gradient-text">no seu escritório.</span></h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">Mostramos o sistema funcionando e respondemos o que for preciso.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3"><CtaLink variant="solid" /><Link href="/produto/contato" className="inline-flex h-11 items-center rounded-full border border-white/20 px-6 text-sm font-semibold text-white hover:bg-white/10">Outras formas de contato</Link></div>
        </div>
      </section>
    </>
  );
}
