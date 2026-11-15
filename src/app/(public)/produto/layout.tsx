import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { contact } from "./_parts";

export const metadata: Metadata = {
  title: { default: "LegalOS — gestão jurídica integrada", template: "%s · LegalOS" },
  description: "Processos, tarefas, prazos, financeiro e atendimento por WhatsApp num só sistema, feito para escritórios de advocacia.",
  robots: { index: true, follow: true },
  openGraph: { title: "LegalOS — gestão jurídica integrada", description: "Tudo do escritório num só sistema: processos, tarefas, prazos, financeiro e WhatsApp.", type: "website", locale: "pt_BR" },
};

const NAV = [
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
  { href: "#contato", label: "Contato" },
];

export default function ProdutoLayout({ children }: { children: React.ReactNode }) {
  const c = contact();
  return (
    <div className="force-light min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f5f5f7]/95 text-[#1d1d1f] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-5 px-5">
          <Link href="/produto" className="flex shrink-0 items-center" aria-label="LegalOS — início"><Brand /></Link>
          <nav aria-label="Principal" className="hidden items-center gap-7 text-xs md:flex">
            {NAV.map(n => <a key={n.href} href={n.href} className="hover:text-black">{n.label}</a>)}
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium">Acessar <ArrowUpRight size={14} aria-hidden /></Link>
            <details className="md:hidden">
              <summary aria-label="Abrir navegação" className="cursor-pointer list-none p-1 [&::-webkit-details-marker]:hidden"><Menu size={20} /></summary>
              <nav aria-label="Navegação móvel" className="absolute inset-x-0 top-14 grid grid-cols-1 gap-1 border-b border-black/10 bg-[#f5f5f7] p-4 shadow-lg">
                {NAV.map(n => <a key={n.href} href={n.href} className="rounded-lg px-3 py-3 text-sm hover:bg-black/5">{n.label}</a>)}
                <Link href="/dashboard" className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-black/5">Acessar o sistema</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="force-dark border-t border-white/10 bg-[#07090f] text-fg">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Brand />
            <p className="mt-4 max-w-sm text-sm text-muted">Gestão jurídica integrada: processos, tarefas, prazos, financeiro e atendimento por WhatsApp, num só lugar.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Navegar</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a href="#recursos" className="text-fg/80 hover:text-fg">Recursos</a></li>
              <li><a href="#planos" className="text-fg/80 hover:text-fg">Planos</a></li>
              <li><a href="#contato" className="text-fg/80 hover:text-fg">Contato</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Acesso</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/login" className="text-fg/80 hover:text-fg">Entrar no sistema</Link></li>
              {c.mail ? <li><a href={c.mail} className="text-fg/80 hover:text-fg">{c.email}</a></li> : null}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-muted">&copy; {new Date().getFullYear()} LegalOS. Todos os direitos reservados.</div>
      </footer>
    </div>
  );
}
