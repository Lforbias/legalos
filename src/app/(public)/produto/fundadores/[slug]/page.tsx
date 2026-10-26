import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { FOUNDERS, getFounder } from "@/config/founders";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FOUNDERS.map(person => ({ slug: person.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const person = getFounder((await params).slug);
  if (!person) notFound();
  return { title: `${person.name} · Co-founder`, description: `${person.name}, Co-founder do LegalOS.` };
}

export default async function FounderProfile({ params }: Props) {
  const person = getFounder((await params).slug);
  if (!person) notFound();
  return <div className="mx-auto max-w-7xl px-4 py-12 md:py-20">
    <Link href="/produto/fundadores" className="inline-flex items-center gap-2 text-xs text-muted transition hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Todos os co-founders</Link>
    <section className="mt-10 grid gap-10 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-20">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-white">
        <Image src={person.image} alt={person.name} fill preload sizes="(max-width: 767px) 100vw, (max-width: 1280px) 45vw, 550px" className="object-cover" style={{ objectPosition: person.position }} />
      </div>
      <div>
        <p className="text-xs uppercase tracking-[.2em] text-muted">{person.role}</p>
        <h1 className="mt-5 text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl">{person.name}</h1>
        <p className="mt-8 max-w-lg text-lg leading-relaxed text-muted">Co-founder do LegalOS, a plataforma que conecta gestão jurídica, intimações, atendimento e inteligência artificial no contexto do escritório.</p>
        <Link href="/produto/sobre" className="mt-9 inline-flex items-center gap-3 border-b border-border pb-3 text-sm font-medium transition hover:border-fg">Conheça a história do LegalOS <ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
      </div>
    </section>
    <section className="mt-20 border-t border-border pt-8">
      <h2 className="text-xs uppercase tracking-[.18em] text-muted">Conheça também</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">{FOUNDERS.filter(other => other.slug !== person.slug).map(other => <Link key={other.slug} href={`/produto/fundadores/${other.slug}`} className="flex items-center justify-between gap-5 rounded-xl border border-border p-5 transition hover:bg-surface"><span><span className="block text-xs text-muted">{other.role}</span><span className="mt-1 block text-sm font-medium">{other.name}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-muted" aria-hidden /></Link>)}</div>
    </section>
  </div>;
}
