import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, Menu, ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { contact } from "./_parts";

export const metadata: Metadata = {
  title: { default: "LegalOS — gestão jurídica integrada", template: "%s · LegalOS" },
  description: "Processos, intimações, prazos, financeiro e atendimento por WhatsApp num só sistema, feito para escritórios de advocacia.",
  robots: { index: true, follow: true },
  openGraph: { title: "LegalOS — gestão jurídica integrada", description: "Tudo do escritório num só sistema: processos, intimações, prazos, financeiro e WhatsApp.", type: "website", locale: "pt_BR" },
};

const NAV = [
  { href: "/produto", label: "Início" },
  { href: "/produto/recursos", label: "Recursos" },
  { href: "/blog", label: "Blog" },
  { href: "/ferramentas", label: "Ferramentas" },
  { href: "/comunidade", label: "Comunidade" },
  { href: "/produto/precos", label: "Preços" },
  { href: "/produto/desktop", label: "Desktop" },
  { href: "/produto/novidades", label: "Novidades" },
  { href: "/produto/roadmap", label: "Roadmap" },
  { href: "/produto/seguranca", label: "Segurança" },
  { href: "/produto/sobre", label: "Sobre" },
  { href: "/produto/fundadores", label: "Co-founders" },
  { href: "/produto/contato", label: "Contato" },
];

export default function ProdutoLayout({ children }: { children: React.ReactNode }) {
  const c = contact();
  return (
    <div className="force-light min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f5f5f7]/95 text-[#1d1d1f] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-5 px-5">
          <Link href="/" className="flex shrink-0 items-center" aria-label="LegalOS — início"><Brand /></Link>
          <nav aria-label="Principal" className="hidden items-center gap-7 text-xs md:flex">
            <Link href="/produto/recursos" className="hover:text-black">Recursos</Link>
            <Link href="/produto/desktop" className="hover:text-black">Desktop</Link>
            <Link href="/produto/precos" className="hover:text-black">Preços</Link>
            <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">Explore <ChevronDown size={12} aria-hidden /></summary><div className="absolute left-1/2 top-full mt-5 grid w-80 -translate-x-1/2 grid-cols-2 gap-1 rounded-2xl border border-black/5 bg-white p-3 shadow-xl">{NAV.filter(n=>!["Início","Recursos","Desktop","Preços"].includes(n.label)).map(n=><Link key={n.href} href={n.href} className="rounded-lg px-3 py-3 hover:bg-black/5">{n.label}</Link>)}</div></details>
            <Link href="/produto/contato" className="hover:text-black">Contato</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium">Acessar <ArrowUpRight size={14} aria-hidden /></Link>
            <details className="md:hidden"><summary aria-label="Abrir navegação" className="cursor-pointer list-none p-1 [&::-webkit-details-marker]:hidden"><Menu size={20} /></summary><nav aria-label="Navegação móvel" className="absolute inset-x-0 top-14 grid grid-cols-2 gap-1 border-b border-black/10 bg-[#f5f5f7] p-4 shadow-lg">{NAV.map(n=><Link key={n.href} href={n.href} className="rounded-lg px-3 py-3 text-sm hover:bg-black/5">{n.label}</Link>)}</nav></details>
          </div>
        </div>
      </header>
      <div className="border-b border-black/5 bg-white px-5 py-3 text-center text-xs leading-5 text-[#515154]">Seu escritório, em um só ecossistema. <Link href="/produto/recursos" className="whitespace-nowrap font-medium text-[#1d1d1f] hover:underline">Conheça o LegalOS <span aria-hidden>›</span></Link></div>
      <main>{children}</main>
      <footer className="force-dark border-t border-white/10 bg-[#07090f] text-fg">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Brand />
            <p className="mt-4 max-w-sm text-sm text-muted">Gestão jurídica integrada: processos, intimações, prazos, financeiro e atendimento por WhatsApp, num só lugar.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Explorar</p>
            <ul className="mt-4 space-y-2 text-sm">{NAV.map((n) => <li key={n.href}><Link href={n.href} className="text-fg/80 hover:text-fg">{n.label}</Link></li>)}</ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Acesso</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/login" className="text-fg/80 hover:text-fg">Entrar no sistema</Link></li>
              {c.mail ? <li><a href={c.mail} className="text-fg/80 hover:text-fg">{c.email}</a></li> : null}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-muted">© {new Date().getFullYear()} LegalOS. Todos os direitos reservados.</div>
      </footer>
    </div>
  );
}
