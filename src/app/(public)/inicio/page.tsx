import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, FileCheck2, Heart, Home, Landmark, Lock, MessageCircle, Scale, ShieldCheck, UserRound, Mail, MapPin, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PRACTICE_AREAS, siteInfo } from "@/config/site";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Advocacia e acompanhamento do seu processo",
  description: "Atuação em Direito do Trabalho, Previdenciário, Imobiliário e Consumidor, Civil e Execução Fiscal, com portal do cliente para acompanhar o andamento.",
  robots: { index: true, follow: true },
};

const ICONS = { briefcase: Briefcase, heart: Heart, shield: ShieldCheck, home: Home, scale: Scale, landmark: Landmark } as const;

const STEPS = [
  { n: "1", title: "Conversamos sobre o seu caso", text: "Escutamos o seu relato, analisamos os documentos e explicamos, com clareza, quais são os caminhos possíveis e os riscos de cada um." },
  { n: "2", title: "Definimos a estratégia", text: "Escolhemos a medida cabível, reunimos as provas e cuidamos de todos os prazos e da atuação perante o tribunal." },
  { n: "3", title: "Você acompanha tudo", text: "Pelo portal do cliente você consulta o resumo do andamento do seu processo e os documentos que compartilharmos com você." },
] as const;

export default function LandingPage() {
  const s = siteInfo();
  const waHref = s.whatsapp ? `https://wa.me/${s.whatsapp}` : null;
  const hasContact = Boolean(waHref || s.email || s.address);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" aria-label="Início" className="flex items-center gap-2 font-semibold"><span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-fg"><Scale className="h-4 w-4" aria-hidden /></span><span className="text-sm">{s.firmName}</span></Link>
          <nav aria-label="Seções" className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#areas" className="hover:text-fg">Áreas de atuação</a>
            <a href="#como-trabalhamos" className="hover:text-fg">Como trabalhamos</a>
            <a href="#portal" className="hover:text-fg">Portal do cliente</a>
            {hasContact ? <a href="#contato" className="hover:text-fg">Contato</a> : null}
          </nav>
          <Link href="/login" className={cn(buttonVariants({ variant: "primary" }), "gap-2")} data-testid="landing-login">
            <Lock className="h-4 w-4" aria-hidden /> Entrar
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 md:pt-24">
          <p className="text-sm font-medium text-primary-text">{s.firmName}</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            Advocacia com atenção ao seu caso e acompanhamento do início ao fim.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted md:text-lg">
            Atuamos em Direito do Trabalho, Previdenciário, Imobiliário e Consumidor, Civil e Execução Fiscal. Cada caso é analisado individualmente, e você acompanha o andamento pelo nosso portal.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {waHref ? (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "primary" }), "h-11 gap-2 px-6")}>
                <MessageCircle className="h-4 w-4" aria-hidden /> Falar com o escritório
              </a>
            ) : (
              <a href="#areas" className={cn(buttonVariants({ variant: "primary" }), "h-11 gap-2 px-6")}>
                Conhecer as áreas de atuação <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            )}
            <Link href="/login" className={cn(buttonVariants({ variant: "secondary" }), "h-11 gap-2 px-6")}>
              <UserRound className="h-4 w-4" aria-hidden /> Área do cliente e da equipe
            </Link>
          </div>
        </section>

        <section id="areas" className="border-t border-border bg-surface/40 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-semibold tracking-tight">Áreas de atuação</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">Atuamos perante os Tribunais de Justiça, a Justiça do Trabalho e a Justiça Federal.</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PRACTICE_AREAS.map((a) => {
                const Icon = ICONS[a.icon];
                return (
                  <li key={a.title} className="rounded-xl border border-border bg-surface p-5">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-primary-text"><Icon className="h-5 w-5" aria-hidden /></span>
                    <h3 className="mt-4 font-medium">{a.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{a.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="como-trabalhamos" className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-semibold tracking-tight">Como trabalhamos</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((st) => (
                <li key={st.n} className="rounded-xl border border-border bg-surface p-5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg">{st.n}</span>
                  <h3 className="mt-4 font-medium">{st.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{st.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="portal" className="border-t border-border bg-surface/40 py-16">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Portal do cliente</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Se você já é nosso cliente, entre com o acesso que enviamos para consultar o resumo do andamento do seu processo e baixar os documentos compartilhados pela equipe. O acesso é pessoal e exige convite do escritório.
              </p>
              <Link href="/login" className={cn(buttonVariants({ variant: "primary" }), "mt-6 h-11 gap-2 px-6")}>
                <Lock className="h-4 w-4" aria-hidden /> Entrar no portal
              </Link>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                [FileCheck2, "Resumo do andamento dos seus processos"],
                [FileCheck2, "Documentos compartilhados, com download seguro"],
                [ShieldCheck, "Você só vê o que é seu: cada cliente acessa apenas os próprios dados"],
              ].map(([Icon, text], i) => {
                const I = Icon as typeof FileCheck2;
                return (
                  <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
                    <I className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span>{text as string}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {hasContact ? (
          <section id="contato" className="py-16">
            <div className="mx-auto max-w-6xl px-4">
              <h2 className="text-2xl font-semibold tracking-tight">Contato</h2>
              <ul className="mt-6 space-y-3 text-sm">
                {waHref ? <li className="flex items-center gap-3"><MessageCircle className="h-4 w-4 text-primary-text" aria-hidden /><a href={waHref} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">WhatsApp: +{s.whatsapp}</a></li> : null}
                {s.email ? <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-primary-text" aria-hidden /><a href={`mailto:${s.email}`} className="underline-offset-4 hover:underline">{s.email}</a></li> : null}
                {s.address ? <li className="flex items-center gap-3"><MapPin className="h-4 w-4 text-primary-text" aria-hidden /><span>{s.address}</span></li> : null}
              </ul>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl space-y-2 px-4 text-xs text-muted">
          <p className="font-medium text-fg">{s.lawyer}{s.oab ? ` · ${s.oab}` : ""}</p>
          <p>As informações deste site têm caráter meramente informativo e não constituem consulta jurídica nem promessa de resultado. Cada caso exige análise individual por advogado.</p>
          <p>Tratamos dados pessoais conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), apenas para a prestação dos serviços advocatícios.</p>
        </div>
      </footer>
    </div>
  );
}
