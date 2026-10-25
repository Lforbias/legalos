import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import Link from "next/link";
import { contact } from "../_parts";
import { Reveal } from "../showcase-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contato", description: "Fale com a gente para conhecer o LegalOS no seu escritório." };

export default function Contato() {
  const c = contact();
  return (
    <>
      <section className="force-dark relative overflow-hidden bg-[#0a0c13] text-fg">
        <div className="prod-grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="prod-glow pointer-events-none absolute left-1/2 top-0 h-[380px] w-[720px] -translate-x-1/2 rounded-full bg-[#FF3B4E]/25 blur-[120px]" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 py-24 text-center md:py-32">
          <h1 className="text-5xl font-semibold leading-[1.03] tracking-tight md:text-7xl">Vamos <span className="prod-gradient-text">conversar.</span></h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/70">Conte como é o seu escritório. Mostramos o LegalOS funcionando e respondemos o que for preciso.</p>
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-20">
        {c.available ? (
          <div className="grid gap-5 md:grid-cols-2">
            {c.whatsapp ? (
              <Reveal><a href={c.whatsapp} target="_blank" rel="noopener noreferrer" className="block h-full rounded-3xl border border-border bg-surface p-8 transition hover:-translate-y-1 hover:shadow-xl">
                <MessageCircle className="h-6 w-6 text-success" aria-hidden /><h2 className="mt-4 text-lg font-semibold">WhatsApp</h2><p className="mt-1 text-sm text-muted">A forma mais rápida de falar com a gente.</p>
              </a></Reveal>
            ) : null}
            {c.mail ? (
              <Reveal delay={90}><a href={c.mail} className="block h-full rounded-3xl border border-border bg-surface p-8 transition hover:-translate-y-1 hover:shadow-xl">
                <Mail className="h-6 w-6 text-primary-text" aria-hidden /><h2 className="mt-4 text-lg font-semibold">E-mail</h2><p className="mt-1 text-sm text-muted">{c.email}</p>
              </a></Reveal>
            ) : null}
          </div>
        ) : (
          <div className="rounded-3xl border border-border bg-surface p-8 text-center">
            <h2 className="text-lg font-semibold">Contato em breve</h2>
            <p className="mt-2 text-sm text-muted">Os canais de contato ainda não foram configurados nesta instalação.</p>
          </div>
        )}
        <p className="mt-10 text-center text-sm text-muted">Já é do escritório? <Link href="/login" className="font-semibold text-primary-text hover:underline">Entrar no sistema</Link></p>
      </section>
    </>
  );
}
