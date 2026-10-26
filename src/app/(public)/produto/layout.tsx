import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { CtaLink, contact } from "./_parts";

export const metadata: Metadata = {
  title: { default: "LegalOS — gestão jurídica integrada", template: "%s · LegalOS" },
  description: "Processos, intimações, prazos, financeiro e atendimento por WhatsApp num só sistema, feito para escritórios de advocacia.",
  robots: { index: true, follow: true },
  openGraph: { title: "LegalOS — gestão jurídica integrada", description: "Tudo do escritório num só sistema: processos, intimações, prazos, financeiro e WhatsApp.", type: "website", locale: "pt_BR" },
};

const NAV = [
  { href: "/produto", label: "Início" },
  { href: "/produto/recursos", label: "Recursos" },
  { href: "/produto/precos", label: "Preços" },
  { href: "/produto/desktop", label: "Desktop" },
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
      <header className="force-dark sticky top-0 z-30 border-b border-white/10 bg-[#0a0c13]/80 text-fg backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <Link href="/produto" className="flex items-center font-semibold" aria-label="LegalOS — início">
            <Brand />
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-5 text-sm text-muted xl:flex">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="transition hover:text-fg">{n.label}</Link>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden px-3 text-sm text-muted transition hover:text-fg sm:inline">Entrar</Link>
            <CtaLink variant="solid" className="h-9 px-4">{c.available ? "Falar com a gente" : "Entrar"}</CtaLink>
          </div>
        </div>
        <nav aria-label="Principal (celular)" className="flex gap-5 overflow-x-auto border-t border-white/5 px-4 py-2 text-sm text-muted xl:hidden">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap">{n.label}</Link>)}
        </nav>
      </header>
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
