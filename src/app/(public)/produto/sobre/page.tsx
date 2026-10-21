import type { Metadata } from "next";
import { PHASES_2, PHASES_3, RELEASES } from "@/lib/updates";
import { CtaLink, SectionTitle } from "../_parts";
import { Reveal } from "../showcase-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sobre", description: "A história do LegalOS, o que já foi entregue e o que vem a seguir." };

export default function Sobre() {
  const next2 = PHASES_2.filter((p) => p.status !== "feita");
  return (
    <>
      <section className="force-dark relative overflow-hidden bg-[#0a0c13] text-fg">
        <div className="prod-grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center md:py-32">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-text">Sobre</p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.03] tracking-tight md:text-7xl">Feito por quem <span className="prod-gradient-text">vive a rotina.</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">O LegalOS nasceu dentro de um escritório de advocacia, a partir de problemas reais: prazo perdido no meio de várias abas, intimação sem dono, WhatsApp solto do processo.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-24 md:grid-cols-2">
        <Reveal><h2 className="text-3xl font-semibold leading-tight tracking-tight">Um sistema, não um monte de ferramentas.</h2></Reveal>
        <Reveal delay={100}>
          <p className="text-muted">Cada recurso é construído em cima da rotina de quem advoga e passa por testes antes de chegar ao escritório. Quando algo ainda não pode ser validado, dizemos. Quando uma automação mexe com o cliente, ela nasce desligada e só roda com a sua autorização.</p>
          <p className="mt-4 text-muted">O sistema convive com as ferramentas que o escritório já usa durante a migração, inclusive com a importação dos dados do Astrea.</p>
        </Reveal>
      </section>

      <section className="border-y border-border bg-surface py-24">
        <div className="mx-auto max-w-4xl px-4">
          <SectionTitle eyebrow="Evolução" title="O que já foi entregue" />
          <ol className="mt-12 space-y-10 border-l border-border pl-8">
            {RELEASES.map((r, i) => (
              <Reveal key={r.id} delay={i * 60}>
                <li className="relative">
                  <span className="absolute -left-[2.45rem] top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-bg" aria-hidden />
                  <p className="font-mono text-xs text-muted">{r.when}</p>
                  <h3 className="text-lg font-semibold">{r.title}</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted">{r.items.map((it) => <li key={it}>{it}</li>)}</ul>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-24">
        <SectionTitle eyebrow="Próximos passos" title="O que vem a seguir" text="O plano está dividido em versões. Cada fase só é considerada entregue depois de verificada." />
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-semibold">Versão 2.0</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">{next2.map((p) => <li key={p.id} className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />{p.title}</li>)}</ul>
          </div>
          <div>
            <h3 className="font-semibold">Versão 3.0</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">{PHASES_3.filter((p) => p.id !== "3.0-F11" && p.id !== "3.0-F10").map((p) => <li key={p.id} className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />{p.title}</li>)}</ul>
          </div>
        </div>
        <p className="mt-8 text-xs text-muted">Planejamento sujeito a mudança conforme a necessidade do escritório.</p>
      </section>

      <section className="force-dark bg-[#0a0c13] text-fg">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Vamos construir junto?</h2>
          <div className="mt-8 flex justify-center"><CtaLink variant="solid" /></div>
        </div>
      </section>
    </>
  );
}
