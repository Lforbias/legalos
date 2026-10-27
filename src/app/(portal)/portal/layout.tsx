import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { product } from "@/config/product";
import { logoutAction } from "@/modules/auth/actions";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { ctx, session, organization } = await requireTenant();
  // equipe do escritório não usa o portal; só contas de cliente
  if (!can(ctx, "portal:access")) redirect("/dashboard");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal" className="text-sm font-semibold">{organization.name} <span className="font-normal text-muted">· Portal do cliente</span></Link>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="hidden sm:inline">{session.user.name}</span>
            <form action={logoutAction}>
              <button type="submit" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-surface-2"><LogOut className="h-3.5 w-3.5" aria-hidden /> Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted">{product.name} · As informações exibidas são as que o escritório escolheu compartilhar com você.</footer>
    </div>
  );
}
