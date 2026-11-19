import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, MessageCircle, MessagesSquare } from "lucide-react";
import { HONESTY, INTEGRATIONS, PWA, RUTE_INFO } from "@/config/showcase";
import { COWORK_AREA, OFFICE_AREAS, areaInfo, areaItemLabels } from "@/config/office-map";
import { CtaLink, Eyebrow, SectionTitle, contact } from "./_parts";
import { Reveal } from "./showcase-client";
import { SiteShell, canSignUp } from "./site-shell";

export const dynamic = "force-dynamic";

const dept = (color: string) => ({ "--dept": color }) as React.CSSProperties;

const NEWS = [
  {
    id: "cowork", icon: MessagesSquare, color: COWORK_AREA.color, title: "LegalOS Cowork",
    text: "Canais e conversas da equipe em tempo real, uma sala para cada processo e reuniões internas, sem misturar com o WhatsApp dos clientes.",
    items: ["Canais, grupos e conversas diretas", "Sala do processo, respeitando o sigilo", "Mensagem vira tarefa sem copiar e colar"],
  },
  {
    id: "rute", icon: Bot, color: RUTE_INFO.tone, title: "RUTE, a IA do escritório",
    text: "Consulta o sistema com as permissões de quem pergunta e mostra de onde tirou cada resposta. O que ela propõe só vale depois que uma pessoa aprova.",
    items: ["Funciona com Claude, ChatGPT ou Gemini", "Propostas revisadas por uma pessoa", "Limites de uso e relatório de LGPD"],
  },
  {
    id: "chat", icon: MessageCircle, color: "#10b981", title: "Atendimento por WhatsApp e e-mail",
    text: "Fila, etiquetas e respostas rápidas, com o cliente, o processo e o financeiro ao lado da conversa.",
    items: ["API oficial da Meta ou conexão por QR-Code", "Nada é enviado sem autorização", "Campanhas com aprovação e agendamento"],
  },
] as const;

export default function ProdutoHome() {
  const signUp = canSignUp();
  return (
    <SiteShell>
      {/* HERO: o mapa do escritório */}
      <section className="relative overflow-hidden" aria-labelledby="home-title">
        <div className="prod-grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-14 pt-28 md:pt-36 lg:grid-cols-[1.05fr_.95fr]">
          <div className="prod-hero-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-1.5 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> LegalOS Evolution · organizado por departamentos
            </span>
            <h1 id="home-title" className="mt-6 text-[40px] font-semibold leading-[1.03] tracking-[-0.035em] sm:text-5xl md:text-[64px]">
              Cada área do escritório <span className="text-primary-text">no seu lugar.</span> Todas conversando.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Jurídico, Atendimento, Comercial, Financeiro e Gestão num só sistema, com a mesa de trabalho de cada pessoa, o Cowork da equipe e a RUTE ajudando no dia a dia.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <CtaLink variant="primary" />
              {signUp ? <Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-full border border-border-strong px-6 text-sm font-semibold transition hover:bg-surface-2" data-testid="home-criar-conta">Criar conta</Link> : null}
              <a href="#departamentos" className="inline-flex h-11 items-center gap-2 px-3 text-sm font-medium text-muted underline underline-offset-4 transition hover:text-fg">Ver os departamentos</a>
            </div>
            {contact().available ? <p className="mt-4 text-sm text-muted">Já usa o LegalOS? <Link href="/login" className="font-semibold text-fg underline underline-offset-4">Entrar</Link></p> : null}
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Departamentos do LegalOS" data-testid="home-mapa">
            {OFFICE_AREAS.map((d, i) => {
              const info = areaInfo(d);
              const wide = d === "mesa" || d === "administracao";
              return (
                <li key={d} style={{ ...dept(info.color), animationDelay: `${i * 60}ms` }}
                  className={`dept-tile dept-pop flex min-h-[120px] flex-col justify-between gap-3 rounded-[22px] border border-border bg-surface p-4 sm:min-h-[132px] ${wide ? "dept-tile-strong col-span-2" : ""}`}>
                  <span className={`dept-swatch h-7 w-7 ${d === "mesa" ? "rounded-full" : "rounded-[9px]"}`} aria-hidden />
                  <span>
                    <span className="block text-[15px] font-semibold">{info.name}</span>
                    <span className="block text-xs text-muted">{info.summary}</span>
                  </span>
                </li>
              );
            })}
            <li style={{ ...dept(COWORK_AREA.color), animationDelay: `${OFFICE_AREAS.length * 60}ms` }}
              className="dept-tile dept-pop col-span-2 flex min-h-[120px] flex-col justify-between gap-3 rounded-[22px] border border-border bg-surface p-4 sm:col-span-1 sm:min-h-[132px]">
              <span className="dept-swatch h-7 w-7 rounded-full" aria-hidden />
              <span>
                <span className="block text-[15px] font-semibold">{COWORK_AREA.name}</span>
                <span className="block text-xs text-muted">A equipe junta, dentro do sistema.</span>
              </span>
            </li>
          </ul>
        </div>

        <div className="relative mx-auto max-w-7xl px-4 pb-20">
          <figure className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-2xl shadow-black/20">
            <div className="flex gap-1.5 border-b border-border px-4 py-2.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" /><span className="h-2.5 w-2.5 rounded-full bg-border-strong" /><span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            </div>
            <Image src="/produto/lobby.webp" alt="Lobby do LegalOS com o resumo do dia e os departamentos do escritório" width={1440} height={900} priority unoptimized className="block h-auto w-full" />
          </figure>
          <p className="mt-3 text-center text-xs text-muted">Tela real do LegalOS com dados fictícios.</p>
        </div>
      </section>

      {/* DEPARTAMENTOS */}
      <section id="departamentos" className="scroll-mt-20 border-t border-border py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4">
          <SectionTitle eyebrow="Departamentos" title="O menu segue a rotina do escritório." text="Cada pessoa abre o departamento em que trabalha e encontra só o que precisa. O que é de outras áreas fica a um clique, sempre ligado ao cliente e ao processo." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OFFICE_AREAS.map((d, i) => {
              const info = areaInfo(d);
              return (
                <Reveal key={d} delay={i * 60} className="h-full">
                  <article className="h-full rounded-[18px] border border-t-[3px] border-border bg-surface p-6" style={{ borderTopColor: info.color }} data-testid={`home-area-${d}`}>
                    <h3 className="text-lg font-semibold">{info.name}</h3>
                    <p className="mt-1.5 text-sm text-muted">{info.summary}</p>
                    <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`O que tem em ${info.name}`}>
                      {areaItemLabels(d).map((label) => <li key={label} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{label}</li>)}
                    </ul>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* NOVIDADES: Cowork, RUTE e Atendimento */}
      <section className="border-t border-border py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4">
          <SectionTitle eyebrow="Novidades" title="Equipe junta, IA com supervisão." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {NEWS.map((n, i) => (
              <Reveal key={n.id} delay={i * 80} className="h-full">
                <article id={n.id} style={dept(n.color)} className="dept-tile h-full scroll-mt-24 rounded-[22px] border border-border bg-surface p-7" data-testid={`home-${n.id}`}>
                  <span className="dept-swatch inline-flex h-10 w-10 items-center justify-center rounded-xl text-white" aria-hidden><n.icon className="h-5 w-5" /></span>
                  <h3 className="mt-5 text-xl font-semibold">{n.title}</h3>
                  <p className="mt-2 text-sm text-muted">{n.text}</p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {n.items.map((it) => <li key={it} className="flex items-center gap-2"><span className="dept-swatch h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />{it}</li>)}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">A RUTE e as automações nascem desligadas em cada escritório e só funcionam depois que a administração configura e autoriza.</p>
        </div>
      </section>

      {/* PRINCÍPIOS */}
      <section className="border-t border-border bg-surface/60 py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4">
          <SectionTitle eyebrow="Princípios" title="Honesto. Privado. Sob o seu controle." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {HONESTY.map((h, i) => (
              <Reveal key={h.title} delay={i * 80} className="h-full">
                <article className="h-full rounded-[22px] border border-border bg-bg p-7">
                  <h3 className="text-lg font-semibold">{h.title}</h3>
                  <p className="mt-2 text-sm text-muted">{h.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <p className="mt-8"><Link href="/produto/seguranca" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-text hover:underline">Como protegemos os dados do escritório <ArrowRight className="h-4 w-4" aria-hidden /></Link></p>
        </div>
      </section>

      {/* CELULAR E INTEGRAÇÕES */}
      <section className="border-t border-border py-20 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 lg:grid-cols-2">
          <div data-testid="produto-pwa">
            <SectionTitle eyebrow="Aplicativo" title={PWA.title} text={PWA.text} />
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {PWA.points.map((p) => (
                <li key={p.title} className="rounded-2xl border border-border bg-surface p-5">
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted">{p.text}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionTitle eyebrow="Conecta com o que você já usa" title="Integrações" />
            <ul className="mt-8 flex flex-wrap gap-2.5" aria-label="Integrações">
              {INTEGRATIONS.map((x) => (
                <li key={x.name} className="rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium">
                  {x.name}{x.note ? <span className="ml-2 text-xs font-normal text-muted">({x.note})</span> : null}
                </li>
              ))}
            </ul>
            <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/produto/recursos" className="font-semibold text-primary-text hover:underline">Todos os recursos →</Link>
              <Link href="/produto/roadmap" className="font-semibold text-primary-text hover:underline">O que vem por aí →</Link>
            </p>
          </div>
        </div>
      </section>

      {/* CONVITE FINAL */}
      <section className="relative overflow-hidden border-t border-border" aria-labelledby="home-cta">
        <div className="prod-glow pointer-events-none absolute left-1/2 top-0 h-[300px] w-[680px] max-w-full -translate-x-1/2 rounded-full bg-primary/20 blur-[110px]" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 py-24 text-center">
          <Eyebrow>Vamos conversar</Eyebrow>
          <h2 id="home-cta" className="mt-4 text-4xl font-semibold leading-[1.06] tracking-tight md:text-6xl">Veja o LegalOS no seu escritório.</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">Mostramos o sistema funcionando, com dados de demonstração, e respondemos o que for preciso.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <CtaLink variant="primary" />
            <Link href="/produto/contato" className="inline-flex h-11 items-center rounded-full border border-border-strong px-6 text-sm font-semibold transition hover:bg-surface-2">Outras formas de contato</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
