import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { FACTS, MODULES, RUTE_INFO, HONESTY, INTEGRATIONS, COMING_SOON } from "@/config/showcase";
import { LEGALOS_PLANS, formatBRL } from "@/config/pricing";
import { PHASES_2 } from "@/lib/updates";
import { CtaLink, contact } from "./_parts";
import { ModuleTabs, Reveal } from "./showcase-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "LegalOS — gestão jurídica integrada",
  description: "Processos, tarefas, prazos, financeiro e atendimento por WhatsApp num só sistema, feito para escritórios de advocacia. Planos a partir de R$ 79/mês.",
  robots: { index: true, follow: true },
  openGraph: { title: "LegalOS — gestão jurídica integrada", description: "Tudo do escritório num só sistema.", type: "website", locale: "pt_BR" },
};

const STATS = [
  { n: String(FACTS.spaces), label: "espaços integrados" },
  { n: String(FACTS.permissions), label: "permissões granulares" },
  { n: `${FACTS.tests}+`, label: "testes automatizados" },
  { n: `${FACTS.tables}`, label: "estruturas de dados" },
];

const SHOWCASES = [
  {
    eyebrow: "Gestão jurídica",
    title: "Cada caso, com tudo\nnum lugar só.",
    text: "Dados, partes, linha do tempo, prazos, tarefas e documentos. Tudo ligado ao cliente e à conversa de WhatsApp do caso.",
    image: "/produto/processo.webp",
    alt: "Tela de um processo no LegalOS com dados, vínculos e conversa de WhatsApp",
    points: ["Número CNJ validado pelo dígito verificador", "Registro de andamentos do processo", "Portal do cliente com compartilhamento controlado", "Processos sigilosos visíveis apenas a quem tem acesso"],
  },
  {
    eyebrow: "LegalOS Chat",
    title: "WhatsApp do escritório.\nLigado ao resto.",
    text: "Atendimento em equipe com fila, etiquetas e respostas rápidas. A conversa já mostra o cliente, o processo, as tarefas e o financeiro.",
    image: "/produto/atendimento.webp",
    alt: "Atendimento por WhatsApp em três colunas com painel do cliente e processo vinculados",
    points: ["API oficial da Meta ou conexão por QR-Code", "Filas, etiquetas, atribuição e notas internas", "Robô e automações, cada um com botão de ligar e desligar", "Nada é enviado a cliente sem autorização"],
  },
  {
    eyebrow: "Financeiro",
    title: "Honorários e despesas.\nSob controle.",
    text: "Contas a receber e a pagar, parcelas, fluxo de caixa por mês e saldo das contas, sempre em reais e calculado sem arredondamento.",
    image: "/produto/financeiro.webp",
    alt: "Financeiro do LegalOS com contas a receber, a pagar e fluxo de caixa",
    points: ["Lançamentos parcelados por cliente e processo", "Cobrança pelo Asaas (Pix, boleto e cartão)", "Lembretes de cobrança por WhatsApp, desligados até autorizar", "Exportação de relatórios em planilha"],
  },
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
      <section className="relative overflow-hidden pb-16 pt-32 md:pb-24 md:pt-44">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[#ffe168]/[.07] blur-[140px]" aria-hidden />
        <div className="relative mx-auto max-w-[1400px] px-6 md:px-10">
          <div className="prod-hero-in mx-auto max-w-5xl text-center">
            <p className="text-[13px] font-medium uppercase tracking-[.3em] text-white/35">
              Gestão jurídica integrada
            </p>
            <h1 className="mt-8 text-[clamp(3rem,7.5vw,7rem)] font-bold leading-[0.92] tracking-[-0.04em]">
              O escritório inteiro.
              <br />
              <span className="inline-block bg-gradient-to-r from-white via-[#ffe168] to-[#ffd000] bg-clip-text text-transparent">
                Num só sistema.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-white/45 md:text-xl">
              Processos, tarefas, prazos, financeiro e WhatsApp conversando entre si.
              Menos aba aberta, menos prazo na cabeça, mais tempo para advogar.
            </p>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-5">
              <CtaLink variant="solid" />
              <a href="#recursos" className="group inline-flex items-center gap-2 text-sm font-medium text-white/45 transition hover:text-white">
                Ver os recursos <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
              </a>
            </div>
          </div>

          <Reveal className="relative mx-auto mt-20 max-w-6xl md:mt-28">
            <div className="pointer-events-none absolute -inset-20 rounded-full bg-[#ffe168]/[.05] blur-[100px]" aria-hidden />
            <div className="relative overflow-hidden rounded-2xl border border-white/[.08] shadow-[0_50px_120px_-30px_rgba(0,0,0,.8)]">
              <Image
                src="/produto/desktop.webp"
                alt="LegalOS Desktop: área de trabalho com busca e pastas de clientes fictícios"
                width={1800} height={1125} priority unoptimized
                className="block w-full"
              />
            </div>
            <p className="mt-6 text-center text-[11px] text-white/25">Tela real com dados fictícios.</p>
          </Reveal>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="border-y border-white/[.06]">
        <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-8 px-6 py-14 md:grid-cols-4 md:px-10">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 80} className="text-center">
              <p className="text-4xl font-bold tracking-tight text-white md:text-5xl">{s.n}</p>
              <p className="mt-2 text-[13px] text-white/35">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── STATEMENT ── */}
      <section className="force-light bg-[#fafaf7]">
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
          <Reveal>
            <h2 className="max-w-[900px] text-[clamp(2rem,5.5vw,4.5rem)] font-bold leading-[0.98] tracking-[-0.03em] text-[#1a1a1a]">
              Planilha aqui.{" "}
              <span className="text-[#1a1a1a]/25">WhatsApp ali.</span>
              <br />
              Prazo{" "}
              <span className="text-[#1a1a1a]/25">na cabeça.</span>
            </h2>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-[#1a1a1a]/45 md:text-xl">
              O escritório funciona quando tudo conversa. No LegalOS, o processo reúne os prazos,
              a tarefa aparece na conversa do cliente e o honorário fica no processo.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── FEATURE SHOWCASES ── */}
      {SHOWCASES.map((feat, i) => {
        const dark = i % 2 !== 0;
        const reversed = i % 2 !== 0;
        return (
          <section key={feat.eyebrow} className={dark ? "bg-[#08090b]" : "force-light bg-[#fafaf7]"}>
            <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-36">
              <div className={`grid items-center gap-12 md:gap-20 lg:grid-cols-2 ${reversed ? "lg:[direction:rtl] lg:[&>*]:[direction:ltr]" : ""}`}>
                <Reveal>
                  <p className={`text-[13px] font-medium uppercase tracking-[.25em] ${dark ? "text-white/30" : "text-[#1a1a1a]/30"}`}>
                    {feat.eyebrow}
                  </p>
                  <h2 className={`mt-5 whitespace-pre-line text-3xl font-bold leading-[1.08] tracking-tight md:text-[2.75rem] ${dark ? "text-white" : "text-[#1a1a1a]"}`}>
                    {feat.title}
                  </h2>
                  <p className={`mt-5 text-base leading-relaxed md:text-lg ${dark ? "text-white/45" : "text-[#1a1a1a]/45"}`}>
                    {feat.text}
                  </p>
                  <ul className="mt-8 space-y-3">
                    {feat.points.map(p => (
                      <li key={p} className={`flex items-start gap-3 text-sm leading-relaxed ${dark ? "text-white/55" : "text-[#1a1a1a]/55"}`}>
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffe168]" aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                </Reveal>
                <Reveal delay={120}>
                  <div className={`overflow-hidden rounded-2xl border ${dark ? "border-white/[.08] shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)]" : "border-black/[.06] shadow-[0_30px_80px_-20px_rgba(0,0,0,.12)]"}`}>
                    <Image src={feat.image} alt={feat.alt} width={1800} height={1125} unoptimized className="block w-full" />
                  </div>
                </Reveal>
              </div>
            </div>
          </section>
        );
      })}

      {/* ── RUTE (AI) ── */}
      <section className="relative overflow-hidden bg-[#08090b] py-28 md:py-40">
        <div className="pointer-events-none absolute right-0 top-1/4 h-[500px] w-[500px] rounded-full bg-[#d7263d]/[.08] blur-[140px]" aria-hidden />
        <div className="relative mx-auto max-w-[1400px] px-6 md:px-10">
          <Reveal>
            <p className="text-[13px] font-medium uppercase tracking-[.25em] text-white/30">Inteligência artificial</p>
            <h2 className="mt-5 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-bold leading-[1] tracking-[-0.02em] text-white">
              A IA propõe.
              <br />
              <span className="text-white/35">Uma pessoa decide.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/40 md:text-lg">
              {RUTE_INFO.text}
            </p>
          </Reveal>
          <div className="mt-16 grid items-center gap-12 md:gap-20 lg:grid-cols-2">
            <Reveal>
              <div className="overflow-hidden rounded-2xl border border-white/[.08] shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)]">
                <Image src="/produto/rute-assistente.webp" alt="Assistente RUTE respondendo com consultas feitas e proposta de tarefa" width={1800} height={1125} unoptimized className="block w-full" />
              </div>
            </Reveal>
            <Reveal delay={100}>
              <ul className="space-y-5">
                {RUTE_INFO.items.map(it => (
                  <li key={it} className="flex items-start gap-3 text-white/55">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RUTE_INFO.tone }} aria-hidden />
                    <span className="text-base leading-relaxed">{it}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── ALL MODULES ── */}
      <section id="recursos" className="force-light scroll-mt-20 bg-[#fafaf7]">
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-36">
          <Reveal>
            <p className="text-[13px] font-medium uppercase tracking-[.25em] text-[#1a1a1a]/30">O produto por dentro</p>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-[#1a1a1a] md:text-5xl">
              Veja o sistema de verdade.
            </h2>
            <p className="mt-4 max-w-2xl text-base text-[#1a1a1a]/45 md:text-lg">
              Telas reais do LegalOS com dados de demonstração. Nenhum cliente real aparece aqui.
            </p>
          </Reveal>
          <div className="mt-14">
            <ModuleTabs modules={MODULES} />
          </div>
        </div>
      </section>

      {/* ── COMPLETE FEATURES ── */}
      <section className="force-light bg-white">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <p className="text-[13px] font-medium uppercase tracking-[.25em] text-[#1a1a1a]/30">A lista completa</p>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-[#1a1a1a] md:text-5xl">
              Tudo o que o escritório precisa.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {RESOURCE_GROUPS.map((g, i) => (
              <Reveal key={g.title} delay={(i % 3) * 80}>
                <article className="h-full rounded-2xl border border-[#1a1a1a]/[.06] bg-[#fafaf7] p-7">
                  <h3 className="text-base font-semibold text-[#1a1a1a]">{g.title}</h3>
                  <ul className="mt-5 space-y-3">
                    {g.items.map(it => (
                      <li key={it} className="flex items-start gap-3 text-sm leading-relaxed text-[#1a1a1a]/50">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#1a1a1a]/20" aria-hidden />{it}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS ── */}
      <section className="force-light overflow-hidden border-y border-[#1a1a1a]/[.06] bg-[#fafaf7] py-14">
        <div className="mx-auto max-w-[1400px] px-6 md:px-10">
          <p className="mb-8 text-center text-[13px] font-medium uppercase tracking-[.25em] text-[#1a1a1a]/30">Integrações</p>
        </div>
        <div className="relative">
          <div className="prod-marquee flex w-max gap-4 whitespace-nowrap">
            {[...INTEGRATIONS, ...INTEGRATIONS].map((x, i) => (
              <span key={i} className="rounded-full border border-[#1a1a1a]/[.08] bg-white px-6 py-3 text-sm font-medium text-[#1a1a1a]/70" aria-hidden={i >= INTEGRATIONS.length}>
                {x.name}{x.note ? <span className="ml-2 text-xs font-normal text-[#1a1a1a]/30">({x.note})</span> : null}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="bg-[#08090b] py-28 md:py-36">
        <div className="mx-auto max-w-[1400px] px-6 md:px-10">
          <Reveal>
            <p className="text-[13px] font-medium uppercase tracking-[.25em] text-white/30">Princípios</p>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-white md:text-5xl">
              Honesto. Privado. Sob o seu controle.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {HONESTY.map((h, i) => (
              <Reveal key={h.title} delay={i * 90}>
                <article className="h-full rounded-2xl border border-white/[.06] bg-white/[.03] p-7">
                  <h3 className="text-lg font-semibold text-white">{h.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/40">{h.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANS ── */}
      <section id="planos" className="scroll-mt-20 border-t border-white/[.06] py-28 md:py-36" data-testid="legalos-plans">
        <div className="mx-auto max-w-[1400px] px-6 md:px-10">
          <Reveal>
            <p className="text-[13px] font-medium uppercase tracking-[.25em] text-white/30">Planos</p>
            <h2 className="mt-5 text-[clamp(2rem,5vw,4rem)] font-bold leading-[1] tracking-[-0.02em] text-white">
              Um começo simples.
              <br />
              <span className="text-white/35">Espaço para evoluir.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/40 md:text-lg">
              Quatro níveis para diferentes momentos do escritório.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {LEGALOS_PLANS.map(p => (
              <Reveal key={p.id}>
                <article className={`flex h-full flex-col rounded-2xl border p-7 ${p.featured ? "border-white/20 bg-white/[.06]" : "border-white/[.06] bg-white/[.02]"}`}>
                  {p.featured && <p className="mb-5 w-fit rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white/60">Foco em equipes</p>}
                  <h3 className="text-2xl font-semibold text-white">{p.name}</h3>
                  <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-white/40">{p.subtitle}</p>
                  <p className="mt-6 text-4xl font-bold tracking-tight text-white">
                    {formatBRL(p.price)}<span className="ml-1 text-sm font-normal text-white/30">/mês</span>
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-white/55">
                    <li>{p.users} usuários</li>
                    <li>Até {p.processes.toLocaleString("pt-BR")} processos</li>
                    {p.whatsappNumbers !== null && <li>{p.whatsappNumbers} {p.whatsappNumbers === 1 ? "número de WhatsApp" : "números de WhatsApp"}</li>}
                  </ul>
                  <p className="mt-6 text-[13px] leading-relaxed text-white/35">{p.audience}</p>
                  <ul className="mt-6 space-y-3 text-sm text-white/45">
                    {p.focus.map(f => (
                      <li key={f} className="flex gap-2.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/20" aria-hidden />{f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-7">
                    <CtaLink variant="ghost" className="w-full justify-center">Conversar sobre este plano</CtaLink>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
          <p className="mt-8 max-w-4xl text-xs leading-relaxed text-white/25">
            Valores mensais em reais. Serviços de IA, WhatsApp, pagamentos e integrações podem ter custos de terceiros. Consulte as condições.
          </p>
        </div>
      </section>

      {/* ── ROADMAP ── */}
      <section className="force-light bg-[#fafaf7]">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <p className="text-[13px] font-medium uppercase tracking-[.25em] text-[#1a1a1a]/30">Em construção</p>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-[#1a1a1a] md:text-5xl">
              E o sistema continua evoluindo.
            </h2>
          </Reveal>
          <ul className="mt-12 grid gap-3 md:grid-cols-2">
            {upcoming.map(t => (
              <Reveal key={t}>
                <li className="flex items-start gap-3 rounded-2xl border border-[#1a1a1a]/[.06] bg-white px-6 py-5 text-sm leading-relaxed text-[#1a1a1a]/55">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffe168]" aria-hidden />{t}
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="contato" className="relative overflow-hidden py-28 md:py-40">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-[#ffe168]/[.06] blur-[140px]" aria-hidden />
        <div className="relative mx-auto max-w-[1400px] px-6 text-center md:px-10">
          <Reveal>
            <p className="text-[13px] font-medium uppercase tracking-[.3em] text-white/30">Vamos conversar</p>
            <h2 className="mt-6 text-[clamp(2.25rem,6vw,5rem)] font-bold leading-[0.95] tracking-[-0.03em] text-white">
              Conheça o LegalOS
              <br />
              <span className="inline-block bg-gradient-to-r from-white via-[#ffe168] to-[#ffd000] bg-clip-text text-transparent">
                no seu escritório.
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-white/40">
              Mostramos o sistema funcionando e respondemos o que for preciso.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-5">
              <CtaLink variant="solid" />
            </div>
          </Reveal>
          {c.available && (
            <div className="mx-auto mt-16 flex max-w-md flex-wrap justify-center gap-6">
              {c.whatsapp && (
                <a href={c.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-white/30 transition hover:text-white/60">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              )}
              {c.email && (
                <a href={c.mail!} className="flex items-center gap-2 text-sm text-white/30 transition hover:text-white/60">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                  {c.email}
                </a>
              )}
            </div>
          )}
          <p className="mt-12 text-sm text-white/25">
            Já é do escritório?{" "}
            <Link href="/login" className="font-semibold text-white/55 transition hover:text-white hover:underline">Entrar no sistema</Link>
          </p>
        </div>
      </section>
    </>
  );
}
