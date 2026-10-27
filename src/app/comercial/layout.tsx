import Link from "next/link";
import { BrandMark } from "@/components/layout/brand";
import { requireComercial } from "@/server/comercial";

const LINKS = [
  { href: "/comercial", label: "Painel" },
  { href: "/comercial/funil", label: "Funil" },
  { href: "/comercial/mapa", label: "Mapa" },
  { href: "/comercial/escritorios", label: "Escritórios" },
  { href: "/comercial/base", label: "Base da Receita" },
  { href: "/comercial/precos", label: "Preços e planos" },
  { href: "/comercial/projecao", label: "Projeção" },
  { href: "/comercial/equipe", label: "Equipe" },
  { href: "/comercial/importar", label: "Importar" },
];

export default async function ComercialLayout({ children }: { children: React.ReactNode }) {
  const { cx, user } = await requireComercial();
  return (
    <div className="min-h-screen bg-bg" data-space="comercial">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2.5">
              <BrandMark />
              <span className="text-[15px] font-semibold tracking-tight">LegalOS <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5 align-middle text-[11px] font-medium text-primary-text">Comercial</span></span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{user.name || user.email} · {cx.role === "GERENTE" ? "Gerência" : "Vendas"}</span>
            {cx.isPlatformAdmin ? <Link href="/admin" className="underline">Administração</Link> : null}
            <Link href="/dashboard" className="underline">Sair do Comercial</Link>
          </div>
        </div>
        <nav aria-label="Comercial" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-fg">{l.label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
