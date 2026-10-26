import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpLeft, Command } from "lucide-react";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { AccessDenied } from "@/components/layout/access-denied";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/** Independent authenticated workspace: no Func shell, sidebar or floating widget. */
export default async function DesktopLayout({ children }: { children: React.ReactNode }) {
  const { ctx, organization } = await requireTenant();
  if (ctx.roleKey === "CLIENT") redirect("/portal");
  if (!can(ctx, "clients:read")) return <AccessDenied />;
  return <div className="desktop-shell min-h-dvh min-w-[1100px] bg-bg text-fg">
    <header className="mx-auto flex h-24 max-w-[1680px] items-center justify-between px-14">
      <Link href="/area-de-trabalho" className="inline-flex items-center gap-3" aria-label="Início do LegalOS Desktop"><span className="grid h-8 w-8 place-items-center rounded-lg border border-border"><Command className="h-4 w-4" strokeWidth={1.4} /></span><span className="text-sm font-medium tracking-tight">LegalOS <span className="font-normal text-muted">Desktop</span></span></Link>
      <span className="max-w-md truncate text-xs text-muted">{organization.name}</span>
      <div className="flex items-center gap-6"><ThemeToggle /><Link href="/" className="inline-flex items-center gap-2 text-xs text-muted transition hover:text-fg"><ArrowUpLeft className="h-3.5 w-3.5" />Voltar ao LegalOS</Link></div>
    </header>
    <main id="conteudo" className="mx-auto max-w-[1520px] px-14 pb-12">{children}</main>
  </div>;
}
