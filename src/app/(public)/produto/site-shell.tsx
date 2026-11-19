import Link from "next/link";
import { Menu } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { registrationMode } from "@/lib/security/registration";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/produto#departamentos", label: "Departamentos" },
  { href: "/produto#cowork", label: "Cowork" },
  { href: "/produto#rute", label: "RUTE" },
  { href: "/produto/seguranca", label: "Segurança" },
  { href: "/produto/precos", label: "Planos" },
];

/**
 * Cabeçalho e rodapé do site público. A página inicial segue o tema da pessoa (escuro por padrão);
 * as demais páginas do site ainda foram desenhadas só para o escuro e usam `dark`.
 */
/** O cadastro público pode estar fechado na instalação; aí o site não oferece "Criar conta". */
export function canSignUp(): boolean {
  return registrationMode() !== "closed";
}

export function SiteShell({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  const signUp = canSignUp();
  return (
    <div className={cn("min-h-dvh", dark ? "force-dark bg-[#08090b] text-[#f5f5f7]" : "bg-bg text-fg")}>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">Pular para o conteúdo</a>
      <header className="fixed top-0 z-50 w-full border-b border-border/60 bg-bg/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:h-[72px]">
          <Link href="/produto" className="flex shrink-0 items-center" aria-label="LegalOS, página inicial">
            <Brand />
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Principal">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-[13px] font-medium text-muted transition hover:text-fg">{n.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-full border border-border-strong px-5 py-2 text-[13px] font-semibold transition hover:bg-surface-2" data-testid="site-entrar">
              Entrar
            </Link>
            {signUp ? (
              <Link href="/register" className="hidden rounded-full bg-primary px-5 py-2 text-[13px] font-semibold text-primary-fg transition hover:bg-primary-hover sm:inline-flex" data-testid="site-criar-conta">
                Criar conta
              </Link>
            ) : null}
            <details className="md:hidden">
              <summary className="cursor-pointer list-none rounded-lg p-1.5 [&::-webkit-details-marker]:hidden" aria-label="Abrir navegação">
                <Menu size={22} aria-hidden />
              </summary>
              <nav className="absolute inset-x-0 top-16 border-b border-border bg-bg p-6 shadow-xl" aria-label="Navegação móvel">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="block py-3 text-lg text-muted hover:text-fg">{n.label}</Link>
                ))}
                <Link href="/login" className="mt-2 block py-3 text-lg font-medium">Acessar o sistema</Link>
                {signUp ? <Link href="/register" className="block py-3 text-lg font-medium text-primary-text">Criar uma conta</Link> : null}
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="conteudo">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-10 md:flex-row md:justify-between">
          <Brand />
          <nav aria-label="Rodapé" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-muted">
            <Link href="/produto/recursos" className="hover:text-fg">Recursos</Link>
            <Link href="/produto/roadmap" className="hover:text-fg">Roadmap</Link>
            <Link href="/produto/sobre" className="hover:text-fg">Sobre</Link>
            <Link href="/produto/contato" className="hover:text-fg">Contato</Link>
            <Link href="/login" className="hover:text-fg">Entrar</Link>
            {signUp ? <Link href="/register" className="hover:text-fg">Criar conta</Link> : null}
          </nav>
          <p className="text-xs text-muted">&copy; {new Date().getFullYear()} LegalOS</p>
        </div>
      </footer>
    </div>
  );
}
