import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates/format";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { COVERAGE_LEVEL_LABEL, type CoverageLevel } from "@/lib/judicial/evidence";
import { requireTenant } from "@/server/session";
import { getBoxV3Monitoring } from "@/server/judicial/box-v3.service";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";

export const metadata: Metadata = { title: "Sincronizações · LegalOS Box 3.0" };
const statusLabel: Record<string, string> = { RUNNING: "Em andamento (registro antigo)", SUCCEEDED: "Concluída", PARTIAL: "Parcial", FAILED: "Falhou", INTERRUPTED: "Interrompida" };
const sourceLabel: Record<string, string> = { DJEN: "DJEN", MNI: "Sistema do tribunal", PORTAL: "Portal do tribunal", DATAJUD: "Consulta pública de processos", AUTOS: "Autos do processo", MONITORING: "Monitoramento" };
const triggerLabel: Record<string, string> = { CRON: "Rotina agendada", MANUAL: "Iniciada manualmente", RETRY: "Nova tentativa" };
const coverageLabel = (coverage: string | null) => coverage ? COVERAGE_LEVEL_LABEL[coverage as CoverageLevel] ?? "Registro de cobertura" : "Não registrada";

export default async function BoxV3SyncPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  if (!ctx.permissions.has("inbox:read")) return <p className="text-sm text-muted">Você não tem acesso à área de intimações deste escritório.</p>;
  const query = await searchParams;
  const requestedPage = /^\d{1,6}$/.test(query.page ?? "") ? Number(query.page) : 1;
  const snapshot = await getBoxV3Monitoring(ctx, { runPage: requestedPage });
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Sincronizações" description={`Histórico de execuções, resultados e cobertura registrada · ${snapshot.runCount} no total.`} actions={<Link href="/box-v3/monitoramento" className={buttonVariants({ variant: "secondary" })}>Ver monitoramento</Link>} />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3/sincronizacoes" />
      <Alert tone="warning">Mostrando a página {snapshot.runPage} de {snapshot.pageCount}. Histórico somente para consulta; o cursor não é exibido e não há botão para retomar ou iniciar sincronização nesta reconstrução.</Alert>
      {!snapshot.runs.length ? <Card><CardBody className="py-10 text-center text-sm text-muted">Nenhuma execução registrada.</CardBody></Card> : <div className="space-y-2">{snapshot.runs.map((run) => <Card key={run.id}><CardBody className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{sourceLabel[run.sourceKind] ?? "Outra fonte"}</h2><Badge tone={run.status === "SUCCEEDED" ? "success" : run.status === "FAILED" ? "danger" : run.status === "PARTIAL" ? "warning" : "neutral"}>{statusLabel[run.status] ?? "Outro estado"}</Badge></div><p className="mt-2 text-xs text-muted">Iniciada: {formatDateTime(run.startedAt, ctx.timezone)} · {triggerLabel[run.trigger] ?? "Gatilho registrado"}</p><p className="mt-1 text-xs text-muted">{run.pages} página(s) · {run.fetched} registros consultados · {run.createdCount} novos · {run.duplicateCount} duplicados · {run.skippedCount} ignorados</p><Link href={`/box-v3/sincronizacoes/${run.id}`} className="mt-2 inline-block text-sm font-medium text-primary-text hover:underline">Ver detalhes da execução</Link></div>
        <dl className="grid grid-cols-2 gap-2 text-xs sm:min-w-48 sm:grid-cols-1"><div><dt className="text-muted">Finalizada</dt><dd className="mt-0.5">{run.finishedAt ? formatDateTime(run.finishedAt, ctx.timezone) : "Sem encerramento registrado"}</dd></div><div><dt className="text-muted">Cobertura</dt><dd className="mt-0.5">{coverageLabel(run.coverage)}</dd></div></dl>
      </CardBody></Card>)}</div>}
      {snapshot.pageCount > 1 ? <nav aria-label="Páginas do histórico de sincronizações" className="flex items-center justify-between"><Link aria-disabled={snapshot.runPage <= 1} href={snapshot.runPage <= 1 ? "/box-v3/sincronizacoes" : `/box-v3/sincronizacoes?page=${snapshot.runPage - 1}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Anterior</Link><span className="text-sm text-muted">Página {snapshot.runPage} / {snapshot.pageCount}</span><Link aria-disabled={snapshot.runPage >= snapshot.pageCount} href={snapshot.runPage >= snapshot.pageCount ? `/box-v3/sincronizacoes?page=${snapshot.pageCount}` : `/box-v3/sincronizacoes?page=${snapshot.runPage + 1}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Próxima</Link></nav> : null}
    </div>
  );
}
