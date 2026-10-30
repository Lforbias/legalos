import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { requireTenant } from "@/server/session";
import { listBoxV3PetitionCases, listBoxV3PetitionDocuments } from "@/server/judicial/box-v3.service";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";
import { createBoxV3PetitionDraftAction } from "../actions";

export const metadata: Metadata = { title: "Novo rascunho · LegalOS Box 3.0" };

export default async function NewBoxV3PetitionPage({ searchParams }: { searchParams: Promise<{ q?: string; caseId?: string }> }) {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  if (!ctx.permissions.has("petitions:write") || !ctx.permissions.has("cases:read") || !ctx.permissions.has("documents:read")) return <p className="text-sm text-muted">Você precisa de acesso a petições, processos e documentos para criar um rascunho.</p>;
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) ?? "";
  const cases = await listBoxV3PetitionCases(ctx, q);
  const caseId = cases.some((item) => item.id === sp.caseId) ? sp.caseId! : "";
  const selectedCase = cases.find((item) => item.id === caseId) ?? null;
  const documents = selectedCase ? await listBoxV3PetitionDocuments(ctx, selectedCase.id) : [];
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Novo rascunho de petição" description="Prepare internamente uma petição a partir de um processo e documento do escritório." actions={<Link href="/box-v3/peticionamento" className={buttonVariants({ variant: "secondary" })}>Voltar à fila</Link>} />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3/peticionamento" />
      <Alert tone="warning">Este fluxo só cria um rascunho no LegalOS. Não envia para revisão, não aprova, não agenda e não protocola.</Alert>
      <Card>
        <CardHeader title="Escolher processo" description="A busca respeita o acesso e o sigilo dos processos do escritório." />
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="min-w-56 flex-1 text-sm">Número ou título<input name="q" defaultValue={q} maxLength={80} placeholder="Buscar processo" className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm" /></label>
            <label className="min-w-56 flex-1 text-sm">Processo<select name="caseId" defaultValue={caseId} className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option value="">Selecione</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.number ?? "Sem número"} · {item.title ?? "Processo sem título"}</option>)}</select></label>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>Carregar documentos</button>
          </form>
          {!cases.length ? <p className="mt-4 text-sm text-muted">Nenhum processo visível encontrado.</p> : null}
        </CardBody>
      </Card>
      {selectedCase ? <Card>
        <CardHeader title="Dados do rascunho" description={`${selectedCase.number ?? "Processo sem número"} · ${selectedCase.title ?? "Processo sem título"}`} />
        <CardBody>
          {!documents.length ? <p className="text-sm text-muted">Este processo ainda não tem documentos disponíveis para compor um rascunho.</p> : <form action={createBoxV3PetitionDraftAction} className="grid gap-4 sm:grid-cols-2"><input type="hidden" name="caseId" value={selectedCase.id} /><label className="text-sm sm:col-span-2">Título<input name="title" required minLength={3} maxLength={200} className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm" placeholder="Ex.: Petição intermediária — juntada de documentos" /></label><label className="text-sm">Tipo<input name="kind" maxLength={80} className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm" placeholder="Ex.: Petição intermediária" /></label><label className="text-sm">Documento principal<select name="documentId" required defaultValue="" className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option value="" disabled>Escolha um documento</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.name} · versão {document.currentVersion}</option>)}</select></label><div className="sm:col-span-2"><button type="submit" className={buttonVariants({ variant: "primary" })}>Criar rascunho</button></div></form>}
        </CardBody>
      </Card> : null}
    </div>
  );
}
