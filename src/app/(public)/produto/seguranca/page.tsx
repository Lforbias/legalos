import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { HONESTY, SECURITY } from "@/config/showcase";
import { CtaLink, SectionTitle } from "../_parts";
import { Reveal } from "../showcase-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Segurança", description: "Como o LegalOS protege os dados do escritório: separação entre escritórios, permissões, 2FA, auditoria, cofre e backups." };

export default function Seguranca() {
  return (
    <>
      <section className="force-dark relative overflow-hidden bg-[#0a0c13] text-fg">
        <div className="prod-grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="prod-glow pointer-events-none absolute left-1/2 top-0 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[#0f8f83]/30 blur-[120px]" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center md:py-32">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5"><Lock className="h-6 w-6 text-[#5eead4]" aria-hidden /></span>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.03] tracking-tight md:text-7xl">Privado. <span className="prod-gradient-text">Ponto.</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">Advocacia é confiança. Os dados dos seus clientes ficam separados, protegidos e rastreáveis.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24">
        <SectionTitle center eyebrow="Proteções" title="O que está de pé hoje" />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SECURITY.map((s, i) => (
            <Reveal key={s.title} delay={(i % 3) * 90}>
              <article className="h-full rounded-3xl border border-border bg-surface p-7">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-info-bg text-primary-text" aria-hidden><Lock className="h-4 w-4" /></span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface py-24">
        <div className="mx-auto max-w-7xl px-4">
          <SectionTitle center eyebrow="Compromissos" title="O que o sistema nunca faz" />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {HONESTY.map((h, i) => (
              <Reveal key={h.title} delay={i * 90}><article className="h-full rounded-3xl border border-border bg-bg p-7"><h3 className="text-lg font-semibold">{h.title}</h3><p className="mt-2 text-sm text-muted">{h.text}</p></article></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Transparência sobre o que está em validação</h2>
        <p className="mt-4 text-muted">O conector com o PJe/MNI e a cobrança automática estão prontos no código e passam nos testes, mas só são ligados no seu escritório depois de validados com credenciais reais, e nunca sem a sua decisão. Preferimos dizer isso a prometer o que ainda não foi comprovado.</p>
      </section>

      <section className="force-dark bg-[#0a0c13] text-fg">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Tem dúvida sobre proteção de dados?</h2>
          <p className="mt-4 text-white/70">Fale com a gente e responderemos com clareza.</p>
          <div className="mt-8 flex justify-center"><CtaLink variant="solid" /></div>
        </div>
      </section>
    </>
  );
}
