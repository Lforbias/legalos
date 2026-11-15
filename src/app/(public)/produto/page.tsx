import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, CalendarClock, Check, MessageCircle, ShieldCheck, Sparkles, BellRing } from "lucide-react";
import { FACTS, MODULES, SPACES, RUTE_INFO, HONESTY, INTEGRATIONS, PWA, COMING_SOON } from "@/config/showcase";
import { LEGALOS_PLANS, formatBRL } from "@/config/pricing";
import { PHASES_2 } from "@/lib/updates";
import { CtaLink, Eyebrow, SectionTitle, contact } from "./_parts";
import { ModuleTabs, Reveal, BrowserFrame } from "./showcase-client";
import { ProductHero } from "./product-hero";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "LegalOS — gestão jurídica integrada",
  description: "Processos, tarefas, prazos, financeiro e atendimento por WhatsApp num só sistema, feito para escritórios de advocacia. Planos a partir de R$ 79/mês.",
  robots: { index: true, follow: true },
  openGraph: { title: "LegalOS — gestão jurídica integrada", description: "Tudo do escritório num só sistema.", type: "website", locale: "pt_BR" },
};

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

const RESOURCE_GROUPS = [
  { title: "Gestão do escritório", items: ["Clientes, processos, tarefas e prazos", "Agenda de audiências e compromissos", "Documentos com versões e modelos", "CRM comercial com funis e automações", "Portal do cliente com compartilhamento controlado"] },
  { title: "Atendimento", items: ["WhatsApp pela API oficial da Meta ou QR-Code", "Filas, etiquetas e respostas rápidas", "Robô e automações com interruptores", "E-mail IMAP/SMTP integrado"] },
  { title: "Financeiro e relatórios", items: ["Contas a receber e a pagar, parcelas e fluxo de caixa", "Cobrança pelo Asaas (Pix, boleto e cartão)", "Relatórios por permissão com exportação"] },
  { title: "RUTE — Assistente de IA", items: ["Conecta Claude, ChatGPT e Gemini ao escritório", "Consulta dados com as permissões do perfil", "Propostas que só valem após confirmação humana", "Governança: limites, auditoria e relatório de LGPD"] },
  { title: "Cálculos jurídicos", items: ["Atrasados da JF, débito TJSP e trabalhista", "Índices oficiais do Banco Central", "Memorial e exportação em Excel/CSV"] },
  { title: "Para quem integra", items: ["API pública v1 com chaves por escopo", "Webhooks assinados com reenvio", "Instalável no celular (PWA)"] },
];

export default function LandingPage() {
  const c = contact();
  const upcoming = [...PHASES_2.filter((p) => p.status !== "feita").map((p) => p.title), ...COMING_SOON].slice(0, 6);
  return (
    <>
      {/* ── HERO ── */}
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
              <a href="#recursos" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/10">Ver os recursos</a>
              <a href="#planos" className="inline-flex h-11 items-center gap-2 px-4 text-sm font-medium text-white/75 underline underline-offset-4 transition hover:text-white">Ver planos e preços</a>
            </div>
          </div>
          <ProductHero />
          <p className="mt-5 text-center text-[11px] text-white/40">Composição ilustrativa do ecossistema com tela real e dados fictícios.</p>
        </div>
      </section>

      {/* ── NÚMEROS ── */}
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

      {/* ── PROBLEMA ── */}
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

      {/* ── ESPAÇOS ── */}
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
              </div>
              <ul className="space-y-2.5 text-sm">
                {RUTE_INFO.items.map((it) => <li key={it} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: RUTE_INFO.tone }} aria-hidden />{it}</li>)}
              </ul>
            </div>
          </article>
        </Reveal>
      </section>

      {/* ── DESKTOP ── */}
      <section className="force-dark overflow-hidden bg-[#101010] text-white">
        <div className="mx-auto max-w-7xl px-4 py-24">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-xs uppercase tracking-[.22em] text-white/50">LegalOS Desktop · Disponível</p>
            <h2 className="mt-4 text-4xl font-medium leading-[1.08] tracking-tight md:text-6xl">O cliente no centro.<br /><span className="text-white/50">O trabalho ao redor.</span></h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/65">Uma área de trabalho independente para o computador. Busque o cliente, abra sua pasta e reúna processos, conversas e a operação do escritório em um só contexto.</p>
          </Reveal>
          <Reveal className="mt-14"><BrowserFrame src="/produto/desktop.webp" alt="LegalOS Desktop: busca e pastas de clientes fictícios" /></Reveal>
          <p className="mt-4 text-center text-xs text-white/45">Tela real com dados fictícios. Acesso conforme as permissões de cada pessoa.</p>
        </div>
      </section>

      {/* ── MÓDULOS (telas reais) ── */}
      <section id="recursos" className="scroll-mt-20 border-y border-border bg-surface-2/60 py-24">
        <div className="mx-auto max-w-7xl px-4">
          <SectionTitle center eyebrow="O produto por dentro" title="Veja o sistema de verdade." text="Telas reais do LegalOS com dados de demonstração. Nenhum cliente real aparece aqui." />
          <div className="mt-12"><ModuleTabs modules={MODULES} /></div>
        </div>
      </section>

      {/* ── RECURSOS COMPLETOS ── */}
      <section className="mx-auto max-w-7xl px-4 py-24">
        <SectionTitle center eyebrow="A lista completa" title="Tudo o que o escritório precisa. Já funcionando." />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {RESOURCE_GROUPS.map((g, i) => (
            <Reveal key={g.title} delay={(i % 3) * 90}>
              <article className="h-full rounded-3xl border border-border bg-surface p-7">
                <h3 className="font-semibold">{g.title}</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-muted">
                  {g.items.map((it) => <li key={it} className="flex gap-2.5"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{it}</li>)}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── UM DIA NO ESCRITÓRIO ── */}
      <section className="border-y border-border bg-surface/40 py-24">
        <div className="mx-auto max-w-5xl px-4">
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
        </div>
      </section>

      {/* ── PRINCÍPIOS ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4">
          <SectionTitle center eyebrow="Princípios" title="Honesto. Privado. Sob o seu controle." />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {HONESTY.map((h, i) => (
              <Reveal key={h.title} delay={i * 90}>
                <article className="h-full rounded-3xl border border-border bg-surface p-7">
                  <h3 className="text-lg font-semibold">{h.title}</h3>
                  <p className="mt-2 text-sm text-muted">{h.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRAÇÕES ── */}
      <section className="overflow-hidden border-y border-border py-20" aria-label="Integrações">
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

      {/* ── APLICATIVO (PWA) ── */}
      <section className="mx-auto max-w-5xl px-4 py-24">
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

      {/* ── PLANOS ── */}
      <section id="planos" className="force-dark scroll-mt-20 bg-[#0a0c13] px-4 py-24 text-white" data-testid="legalos-plans">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs uppercase tracking-[.2em] text-white/50">Planos LegalOS</p>
          <h2 className="mt-4 text-4xl font-medium tracking-tight md:text-6xl">Um começo simples.<br /><span className="text-white/50">Espaço para evoluir.</span></h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/65">Quatro níveis para diferentes momentos do escritório. Escolha a estrutura que acompanha o tamanho da sua equipe e o volume de processos.</p>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {LEGALOS_PLANS.map(p => (
              <article key={p.id} className={`flex flex-col rounded-3xl border p-6 ${p.featured ? "border-white/60 bg-white/[.08]" : "border-white/15 bg-white/[.025]"}`}>
                <p className="text-[10px] uppercase tracking-[.18em] text-white/45">{p.featured ? "Foco em equipes" : "Plano mensal"}</p>
                <h3 className="mt-5 text-2xl font-medium">{p.name}</h3>
                <p className="mt-2 min-h-12 text-sm text-white/60">{p.subtitle}</p>
                <p className="mt-7 text-3xl font-medium">{formatBRL(p.price)}<span className="ml-1 text-sm font-normal text-white/50">/mês</span></p>
                <ul className="mt-4 space-y-2 text-sm text-white/80">
                  <li>{p.users} usuários</li>
                  <li>Até {p.processes.toLocaleString("pt-BR")} processos</li>
                  {p.whatsappNumbers !== null && <li>{p.whatsappNumbers} {p.whatsappNumbers === 1 ? "número de WhatsApp" : "números de WhatsApp"}</li>}
                </ul>
                <p className="mt-7 min-h-16 text-sm leading-relaxed text-white/65">{p.audience}</p>
                <p className="mt-5 text-xs font-medium text-white/80">Foco do plano</p>
                <ul className="mt-4 space-y-3 text-sm text-white/65">
                  {p.focus.map(f => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />{f}</li>)}
                </ul>
                <div className="mt-auto border-t border-white/15 pt-5">
                  <CtaLink variant="ghost" className="w-full justify-center text-center">Conversar sobre este plano</CtaLink>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-7 max-w-4xl text-xs leading-relaxed text-white/50">Valores mensais em reais. Serviços de IA, WhatsApp, pagamentos e integrações podem ter custos de terceiros, conforme o uso e o provedor. Consulte as condições de contratação e de implantação.</p>
        </div>
      </section>

      {/* ── ROADMAP ── */}
      <section className="mx-auto max-w-5xl px-4 py-24">
        <SectionTitle eyebrow="Em construção" title="E o sistema continua evoluindo." text="Próximas entregas já planejadas:" />
        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {upcoming.map((t) => (
            <li key={t} className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      </section>

      {/* ── CONTATO / CTA FINAL ── */}
      <section id="contato" className="force-dark relative overflow-hidden bg-[#0a0c13] text-fg">
        <div className="prod-glow pointer-events-none absolute left-1/2 top-0 h-[360px] w-[760px] -translate-x-1/2 rounded-full bg-[#FF3B4E]/25 blur-[120px]" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center">
          <Eyebrow>Vamos conversar</Eyebrow>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">Conheça o LegalOS <span className="prod-gradient-text">no seu escritório.</span></h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">Mostramos o sistema funcionando e respondemos o que for preciso.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <CtaLink variant="solid" />
          </div>
          {c.available ? (
            <div className="mx-auto mt-12 flex max-w-md flex-wrap justify-center gap-4">
              {c.whatsapp ? <a href={c.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-white/60 transition hover:text-white"><MessageCircle className="h-4 w-4" /> WhatsApp</a> : null}
              {c.email ? <a href={c.mail!} className="flex items-center gap-2 text-sm text-white/60 transition hover:text-white"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg> {c.email}</a> : null}
            </div>
          ) : null}
          <p className="mt-10 text-sm text-white/50">Já é do escritório? <Link href="/login" className="font-semibold text-white/80 hover:text-white hover:underline">Entrar no sistema</Link></p>
        </div>
      </section>
    </>
  );
}
