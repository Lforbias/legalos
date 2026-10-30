import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateTime } from "@/lib/dates/format";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { requireTenant } from "@/server/session";
import { getBoxV3Imports } from "@/server/judicial/box-v3.service";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";
import { BoxV3ImportForm } from "@/modules/box-v3/import-form";

export const metadata: Metadata = { title: "Importações · LegalOS Box 3.0" };
const statusLabel: Record<string, string> = { CREATED: "Criado", EXISTS: "Já existia", INVALID: "Inválido", DUPLICATE: "Duplicado", FAILED: "Falhou", NONE: "Não solicitado", PENDING: "Pendente", OK: "Concluído", PARTIAL: "Parcial", SKIPPED: "Ignorado" };

export default async function BoxV3ImportsPage() {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  if (!ctx.permissions.has("cases:read")) return <p className="text-sm text-muted">Você não tem acesso às importações de processos deste escritório.</p>;
  const batches = await getBoxV3Imports(ctx);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Importações de processos" description="Cadastro interno por lote e resultados preservados por número." />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3/importacoes" />
      <Alert tone="warning">O cadastro manual valida os números CNJ e cria apenas registros internos. Esta tela não consulta tribunais, atualiza andamentos nem baixa autos.</Alert>
      {ctx.permissions.has("cases:write") ? <BoxV3ImportForm canSelectClient={ctx.permissions.has("clients:read")} /> : null}
      {!batches.length ? <Card><CardBody className="py-10 text-center text-sm text-muted">Nenhum lote de importação registrado.</CardBody></Card> : <div className="space-y-3">{batches.map((batch) => <Card key={batch.id}>
        <CardHeader title={`Lote · ${batch.items.length} item(ns) visível(is)`} description={`Criado em ${formatDateTime(batch.createdAt, ctx.timezone)}`} />
        {batch.hasHiddenItems ? <p className="px-5 pt-3 text-xs text-muted">Alguns itens foram ocultados pelas regras de sigilo do processo.</p> : null}
        <CardBody>{!batch.items.length ? <p className="text-sm text-muted">{batch.hasHiddenItems ? "Os itens deste lote estão ocultos pelas regras de sigilo." : "Lote sem itens registrados."}</p> : <div className="divide-y divide-border">{batch.items.map((item, index) => <div key={item.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div><p className="font-mono text-sm">{item.number ?? "Número não normalizado"}</p><p className="mt-1 text-xs text-muted">Resultado do cadastro: {statusLabel[item.createStatus] ?? item.createStatus}{item.caseId ? <> · <Link href={`/processos/${item.caseId}`} className="text-primary-text hover:underline">Abrir processo</Link></> : ""}</p></div>
          <div className="flex flex-wrap gap-1.5"><Badge tone={item.syncStatus === "OK" ? "success" : item.syncStatus === "FAILED" ? "danger" : "neutral"}>Andamentos: {statusLabel[item.syncStatus] ?? item.syncStatus}</Badge><Badge tone={item.autosStatus === "OK" ? "success" : item.autosStatus === "FAILED" ? "danger" : "neutral"}>Autos: {statusLabel[item.autosStatus] ?? item.autosStatus}</Badge><span className="sr-only">Item {index + 1}</span></div>
        </div>)}</div>}</CardBody>
      </Card>)}</div>}
    </div>
  );
}
