import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { BulkNoteForm } from "@/modules/cases/extras-ui";
import { can } from "@/server/context";
import { listCases } from "@/server/services/case.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Nota em lote" };

export default async function BulkNotePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:write")) return <AccessDenied />;
  const sp = await searchParams;
  const r = await listCases(ctx, { q: sp.q, board: true });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nota em lote" description="Aplique a mesma nota a até 50 processos de uma vez." actions={<Link href="/processos" className={buttonVariants({ variant: "secondary" })}>Voltar aos processos</Link>} />
      <form method="get" role="search" aria-label="Filtrar processos" className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="q" className="sr-only">Buscar processos</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Número, título, parte ou cliente" className="pl-9" />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Buscar</button>
      </form>
      {r.truncated ? <p className="mb-2 text-xs text-warning">Mostrando os 200 processos mais recentes. Refine a busca para achar os demais.</p> : null}
      <BulkNoteForm key={sp.q ?? ""} options={r.items.map((c) => ({ id: c.id, label: `${c.title} — ${c.number ?? c.legacyNumber ?? "sem número"}` }))} />
    </div>
  );
}
