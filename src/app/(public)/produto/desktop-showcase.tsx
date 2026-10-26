import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DesktopBrand } from "@/components/layout/desktop-brand";
import { BrowserFrame, Reveal } from "./showcase-client";

export function DesktopShowcase() {
  return <section id="desktop" className="force-dark overflow-hidden bg-[#101010] text-white" data-testid="produto-desktop">
    <div className="mx-auto max-w-7xl px-4 py-24 md:py-32">
      <Reveal className="grid items-end gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <DesktopBrand className="w-[230px]" />
          <p className="mt-9 text-xs uppercase tracking-[.22em] text-white/50">Uma nova vertente do LegalOS · Disponível</p>
          <h2 className="mt-4 max-w-2xl text-4xl font-medium leading-[1.08] tracking-tight md:text-6xl">O cliente no centro.<br /><span className="text-white/50">O trabalho ao redor.</span></h2>
        </div>
        <div>
          <p className="max-w-md text-base leading-relaxed text-white/65">Uma área de trabalho independente, feita para o computador. Busque o cliente, abra sua pasta e reúna os processos, as conversas e a operação do escritório em um só contexto.</p>
          <Link href="/produto/desktop" className="mt-6 inline-flex items-center gap-3 border-b border-white/40 pb-2 text-sm font-medium transition hover:border-white">Conhecer o LegalOS Desktop <ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </Reveal>
      <Reveal className="mt-14"><BrowserFrame src="/produto/desktop.webp" alt="LegalOS Desktop: busca e pastas de clientes fictícios, com seus casos e processos" /></Reveal>
      <p className="mt-4 text-xs text-white/45">Tela real com dados fictícios. Uso exclusivo em computador; acesso conforme as permissões de cada pessoa.</p>
    </div>
  </section>;
}
