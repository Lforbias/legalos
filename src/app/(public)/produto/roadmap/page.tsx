import { CheckCircle2, Hammer, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import { PHASES_2, PHASES_3, PHASES_4, PHASES_5, PHASES_6, PHASES_7, type Phase } from "@/lib/updates";
import { CtaLink, SectionTitle } from "../_parts";
import { Reveal } from "../showcase-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Roadmap", description: "Tudo o que o LegalOS já entrega e tudo o que está sendo construído, versão por versão." };

const activePhase = (p: Phase) => !/Box|LegalMail|intima|certificad|tribun|DJEN|MNI|peticionamento/i.test(p.title);

type Block = { version: string; name: string; phases: Phase[] };

const DELIVERED: Block[] = [
  { version: "6.0", name: "RUTE, a IA do LegalOS", phases: PHASES_6 },
  { version: "5.0", name: "Cálculos, portal do cliente, cobrança e copiloto", phases: PHASES_5 },
  { version: "4.0", name: "LegalOS Chat completo", phases: PHASES_4.filter((p) => p.status === "feita" && activePhase(p)) },
  { version: "2.0", name: "Gestão do escritório, financeiro, migração e IA", phases: PHASES_2.filter((p) => p.status === "feita" && activePhase(p)) },
];

const BASE = [
  "Clientes, processos, tarefas, prazos, agenda, documentos e CRM",
  "WhatsApp (API oficial ou QR-Code), fila de atendimento e robô",
  "Financeiro, relatórios, equipe e portal do cliente",
  "Multi-escritório com permissões por perfil, auditoria e verificação em duas etapas",
  "API pública, webhooks e aplicativo instalável no celular (PWA)",
];

const PENDING = PHASES_3.concat(PHASES_4).filter((p) => p.status !== "feita" && activePhase(p));

const BUILDING: { title: string; text: string; items: string[] }[] = [
  {
    title: "Robôs de tribunal",
    text: "Consulta e protocolo direto nos portais mais usados. Sem resolver captcha, com confirmação de uma pessoa antes de protocolar e credenciais guardadas no cofre de cada usuário.",
    items: ["e-SAJ", "eproc", "PROJUDI", "Fila de tarefas, estado \"aguardando pessoa\", limites e auditoria"],
  },
  {
    title: "Completar com o que ainda não vimos",
    text: "Itens que dependem das telas dos sistemas que usamos como referência.",
    items: PENDING.map((p) => `${p.id.replace("-F", " · F")}: ${p.title}`),
  },
];

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-center">
      <p className="text-3xl font-semibold tracking-tight">{n}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

export default function Roadmap() {
  const done = DELIVERED.reduce((a, b) => a + b.phases.length, 0);
  return (
    <>
      <section className="force-dark relative overflow-hidden bg-[#0a0c13] text-fg">
        <div className="prod-grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center md:py-32">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-text">Roadmap</p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.03] tracking-tight md:text-7xl">Tudo o que temos. <span className="prod-gradient-text">E tudo o que vem aí.</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">Cada item abaixo está marcado como entregue, em construção ou planejado. O que é futuro não funciona ainda e não é vendido como se funcionasse.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-3 sm:grid-cols-3" data-testid="roadmap-counts">
          <Count n={done} label="entregas concluídas nas versões 2.0 a 6.0" />
          <Count n={PHASES_7.length + PENDING.length + 1} label="itens na fila de construção" />
          <Count n={5} label="versões entregues desde a base" />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-8" data-testid="roadmap-delivered">
        <SectionTitle eyebrow="Disponível" title="O que já funciona hoje" text="Da base do sistema à IA, versão por versão." />
        <Reveal>
          <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
            <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Base (1.x)</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">{BASE.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        </Reveal>
        {DELIVERED.map((b) => (
          <Reveal key={b.version}>
            <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
              <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Versão {b.version}: {b.name}</p>
              <ul className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-2">
                {b.phases.map((p) => <li key={p.id} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />{p.title}</li>)}
              </ul>
            </div>
          </Reveal>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16" data-testid="roadmap-building">
        <SectionTitle eyebrow="Em construção" title="No que estamos trabalhando" text="Já decidido e na fila de construção." />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {BUILDING.map((b) => (
            <Reveal key={b.title}>
              <div className="h-full rounded-2xl border border-border bg-surface p-6">
                <p className="flex items-center gap-2 text-sm font-semibold"><Hammer className="h-4 w-4 text-accent" aria-hidden /> {b.title}</p>
                <p className="mt-2 text-sm text-muted">{b.text}</p>
                <ul className="mt-3 space-y-2 text-sm">{b.items.map((t) => <li key={t} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />{t}</li>)}</ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20" data-testid="roadmap-next">
        <SectionTitle eyebrow="Planejado" title="Versão 7.0: RUTE com voz e a rotina do escritório" text="Ideias aprovadas para a fila. Nada disto existe ainda." />
        <Reveal>
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {PHASES_7.slice().sort((a, b) => Number(a.id.split("F")[1]) - Number(b.id.split("F")[1])).map((p) => (
              <li key={p.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /> <span>{p.title}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section className="force-dark bg-[#0a0c13] text-fg">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Quer ver o que já funciona?</h2>
          <div className="mt-8 flex justify-center"><CtaLink /></div>
        </div>
      </section>
    </>
  );
}
