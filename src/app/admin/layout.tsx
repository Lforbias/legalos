import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { requirePlatform } from "@/server/platform";

const LINKS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/conteudo", label: "Conteúdo e audiência" },
  { href: "/admin/comercial", label: "Comercial" },
  { href: "/admin/escritorios", label: "Escritórios" },
  { href: "/admin/planos", label: "Planos e preços" },
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/auditoria", label: "Auditoria" },
  { href: "/admin/saude", label: "Saúde e integrações" },
  { href: "/admin/developer", label: "Developer" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePlatform();
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Brand />
            <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">Administração da plataforma</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{user.email}</span>
            <Link href="/dashboard" className="underline">Voltar ao sistema</Link>
          </div>
        </div>
        <nav aria-label="Administração" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-fg">{l.label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
