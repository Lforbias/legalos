import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { RegistryManager } from "@/modules/registry/registry-manager";
import { can } from "@/server/context";
import { listRegistry } from "@/server/services/party-registry.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Cadastro de partes" };

export default async function RegistryPage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const r = await listRegistry(ctx, { q: sp.q, page });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Cadastro de partes" description="Cadastre uma vez e reaproveite em qualquer processo." actions={<Link href="/processos" className={buttonVariants({ variant: "secondary" })}>Voltar aos processos</Link>} />
      <form method="get" role="search" aria-label="Buscar partes" className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="q" className="sr-only">Buscar por nome, documento ou profissão</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Nome, documento ou profissão" className="pl-9" />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Buscar</button>
      </form>
      <RegistryManager
        canWrite={can(ctx, "cases:write")}
        rows={r.items.map((i) => ({ id: i.id, kind: i.kind, name: i.name, document: i.document, profession: i.profession, issuingOrgan: i.issuingOrgan, email: i.email, phone: i.phone, notes: i.notes, cases: i._count.caseParties }))}
      />
      <Pagination basePath="/partes" params={{ q: sp.q }} page={r.page} pages={r.pages} total={r.total} />
    </div>
  );
}
