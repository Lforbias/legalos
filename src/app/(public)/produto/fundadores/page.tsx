import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FounderCards } from "./founder-cards";

export const metadata: Metadata = {
  title: "Co-founders",
  description: "Conheça os co-founders do LegalOS: Luiz Felipe de Oliveira Roweder Bernardes, Talita Silva de Brito e Arthur Camilo da Silva.",
};

export default function FoundersPage() {
  return <>
    <section className="mx-auto max-w-7xl px-4 pb-14 pt-20 md:pb-20 md:pt-28">
      <p className="text-xs uppercase tracking-[.22em] text-muted">As pessoas por trás do LegalOS</p>
      <div className="mt-6 grid gap-7 md:grid-cols-[1.2fr_1fr] md:items-end">
        <h1 className="text-5xl font-medium leading-[1.04] tracking-tight md:text-7xl">Co-founders<span className="text-primary">.</span></h1>
        <p className="max-w-md text-lg leading-relaxed text-muted">Uma plataforma construída a partir da rotina real de um escritório. Conheça quem está na origem do LegalOS.</p>
      </div>
    </section>
    <section aria-label="Co-founders do LegalOS" className="mx-auto max-w-7xl px-4 pb-24"><FounderCards /></section>
    <section className="force-dark bg-[#0a0c13] text-white">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-4 py-20 md:flex-row md:items-end">
        <div><p className="text-xs uppercase tracking-[.2em] text-white/45">Nossa tecnologia</p><h2 className="mt-4 max-w-2xl text-3xl font-medium leading-tight tracking-tight md:text-5xl">O escritório inteiro.<br /><span className="text-white/50">Num só sistema.</span></h2></div>
        <Link href="/produto" className="inline-flex w-fit items-center gap-4 border-b border-white/30 pb-3 text-sm font-medium transition hover:border-white">Conhecer o LegalOS <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </div>
    </section>
  </>;
}
