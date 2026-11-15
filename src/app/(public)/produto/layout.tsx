import type { Metadata } from "next";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Brand } from "@/components/layout/brand";

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
  return (
    <div className="force-dark min-h-dvh bg-[#08090b] text-[#f5f5f7]">
      <header className="fixed top-0 z-50 w-full border-b border-white/[.04] bg-[#08090b]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 md:h-[72px] md:px-10">
          <Link href="/produto" className="flex shrink-0 items-center" aria-label="LegalOS">
            <Brand />
          </Link>
          <nav className="hidden items-center gap-8 md:flex" aria-label="Principal">
            {NAV.map(n => (
              <a key={n.href} href={n.href} className="text-[13px] font-medium text-white/50 transition hover:text-white">{n.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#08090b] shadow-lg shadow-white/5 transition hover:bg-white/90">
              Acessar
            </Link>
            <details className="md:hidden">
              <summary className="cursor-pointer list-none p-1 text-white [&::-webkit-details-marker]:hidden" aria-label="Abrir navegação">
                <Menu size={22} />
              </summary>
              <nav className="absolute inset-x-0 top-16 border-b border-white/10 bg-[#08090b]/98 p-6 backdrop-blur-2xl" aria-label="Navegação móvel">
                {NAV.map(n => (
                  <a key={n.href} href={n.href} className="block py-3 text-lg text-white/70 hover:text-white">{n.label}</a>
                ))}
                <Link href="/dashboard" className="mt-2 block py-3 text-lg font-medium text-white">Acessar o sistema</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-white/[.06]">
        <div className="mx-auto max-w-[1400px] px-6 py-10 md:px-10">
          <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
            <Brand />
            <div className="flex flex-wrap items-center gap-6 text-[13px] text-white/30">
              {NAV.map(n => (
                <a key={n.href} href={n.href} className="transition hover:text-white/60">{n.label}</a>
              ))}
              <Link href="/login" className="transition hover:text-white/60">Entrar</Link>
            </div>
            <p className="text-xs text-white/20">&copy; {new Date().getFullYear()} LegalOS</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
