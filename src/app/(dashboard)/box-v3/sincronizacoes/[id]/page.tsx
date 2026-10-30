import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates/format";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { COVERAGE_LEVEL_LABEL, type CoverageLevel } from "@/lib/judicial/evidence";
import { isRunInterrupted, RUN_HEARTBEAT_TIMEOUT_MIN } from "@/lib/judicial/health-policy";
import { NotFoundError } from "@/lib/permissions/check";
import { requireTenant } from "@/server/session";
import { getBoxV3SyncRun } from "@/server/judicial/box-v3.service";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";
import { markBoxV3SyncRunInterruptedAction } from "../../monitoramento/actions";

export const metadata: Metadata = { title: "Detalhe da execução · LegalOS Box 3.0" };
const sourceLabel: Record<string, string> = { DJEN: "DJEN", MNI: "Sistema do tribunal", PORTAL: "Portal do tribunal", DATAJUD: "Consulta pública de processos", AUTOS: "Autos do processo", MONITORING: "Monitoramento" };
const statusLabel: Record<string, string> = { RUNNING: "Em andamento (registro antigo)", SUCCEEDED: "Concluída", PARTIAL: "Parcial", FAILED: "Falhou", INTERRUPTED: "Interrompida" };
const triggerLabel: Record<string, string> = { CRON: "Rotina agendada", MANUAL: "Iniciada manualmente", RETRY: "Nova tentativa" };

export default async function BoxV3SyncRunPage({ params }: { params: Promise<{ id: string }> }) {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  if (!ctx.permissions.has("inbox:read")) return <p className="text-sm text-muted">Você não tem acesso ao histórico de sincronizações deste escritório.</p>;
  const { id } = await params;
  let result: Awaited<ReturnType<typeof getBoxV3SyncRun>>;
  try { result = await getBoxV3SyncRun(ctx, id); } catch (error) { if (error instanceof NotFoundError) notFound(); throw error; }
  const { run } = result;
  const coverage = run.coverage ? COVERAGE_LEVEL_LABEL[run.coverage as CoverageLevel] ?? "Registro de cobertura" : "Não registrada";
  const staleRun = run.status === "RUNNING" && run.lastActivityAt !== null && isRunInterrupted(run.lastActivityAt, new Date());
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Detalhe da execução" description={`${sourceLabel[run.sourceKind] ?? "Outra fonte"} · ${formatDateTime(run.startedAt, ctx.timezone)}`} actions={<Link href="/box-v3/sincronizacoes" className={buttonVariants({ variant: "secondary" })}>Voltar às sincronizações</Link>} />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3/sincronizacoes" />
      <Alert tone="warning">Registro histórico somente para consulta. Esta página não retoma execuções, consulta tribunais nem exibe cursores ou mensagens técnicas brutas.</Alert>
      <Card><CardHeader title="Resumo" description="Contagens e período registrados para esta execução." /><CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div><p className="text-xs text-muted">Estado</p><div className="mt-1"><Badge tone={run.status === "SUCCEEDED" ? "success" : run.status === "FAILED" ? "danger" : run.status === "PARTIAL" ? "warning" : "neutral"}>{statusLabel[run.status] ?? "Outro estado"}</Badge></div></div>
        <div><p className="text-xs text-muted">Origem do início</p><p className="mt-1 text-sm">{triggerLabel[run.trigger] ?? "Gatilho registrado"}</p></div>
        <div><p className="text-xs text-muted">Cobertura</p><p className="mt-1 text-sm">{coverage}</p></div>
        <div><p className="text-xs text-muted">Início</p><p className="mt-1 text-sm">{formatDateTime(run.startedAt, ctx.timezone)}</p></div>
        <div><p className="text-xs text-muted">Última atividade</p><p className="mt-1 text-sm">{run.lastActivityAt ? formatDateTime(run.lastActivityAt, ctx.timezone) : "Não aplicável"}</p></div>
        <div><p className="text-xs text-muted">Fim</p><p className="mt-1 text-sm">{run.finishedAt ? formatDateTime(run.finishedAt, ctx.timezone) : "Sem encerramento registrado"}</p></div>
        <div><p className="text-xs text-muted">Período consultado</p><p className="mt-1 text-sm">{run.windowFrom ? formatDateTime(run.windowFrom, ctx.timezone) : "Início não registrado"} – {run.windowTo ? formatDateTime(run.windowTo, ctx.timezone) : "fim não registrado"}</p></div>
        <div><p className="text-xs text-muted">Páginas e registros</p><p className="mt-1 text-sm">{run.pages} página(s) · {run.fetched} consultado(s){run.reportedTotal != null ? ` · ${run.reportedTotal} informado(s) pela fonte` : ""}</p></div>
        <div><p className="text-xs text-muted">Resultado</p><p className="mt-1 text-sm">{run.createdCount} novo(s) · {run.duplicateCount} duplicado(s) · {run.skippedCount} ignorado(s)</p></div>
      </CardBody></Card>
      {run.status === "RUNNING" ? <Card><CardHeader title="Execução ainda marcada como aberta" description="Esta ação só encerra o registro interno quando o sinal de vida ultrapassa o limite operacional." /><CardBody className="space-y-3">{staleRun && ctx.permissions.has("integrations:manage") ? <><Alert tone="warning">O último sinal de vida ultrapassou {RUN_HEARTBEAT_TIMEOUT_MIN} minutos. Marcar como interrompida não retoma a execução e não consulta a fonte.</Alert><form action={markBoxV3SyncRunInterruptedAction}><input type="hidden" name="id" value={run.id} /><button type="submit" className={buttonVariants({ variant: "secondary" })}>Marcar como interrompida</button></form></> : <p className="text-sm text-muted">{ctx.permissions.has("integrations:manage") ? "A execução ainda está dentro do limite de sinal de vida ou esse horário não foi registrado." : "É necessária a permissão de gerenciamento de integrações para encerrar um registro parado."}</p>}</CardBody></Card> : null}
      {run.hasInternalError ? <Alert tone="warning">Há um registro interno de falha nesta execução. O detalhe técnico completo permanece restrito aos registros operacionais.</Alert> : null}
      <Card><CardHeader title="Evidências relacionadas" description="Verificações associadas a esta execução, sem dados de acesso ou conteúdo bruto." /><CardBody>{!result.evidence.length ? <p className="text-sm text-muted">Nenhuma evidência vinculada diretamente a esta execução.</p> : <div className="divide-y divide-border">{result.evidence.map((item, index) => <div key={`${item.connectorKey}-${item.operation}-${item.checkedAt.toISOString()}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium">{item.connectorKey} · {item.operation}</p><p className="mt-1 text-xs text-muted">Tribunal/fonte: {item.courtCode} · ambiente {item.environment}{item.reasonCode ? ` · motivo ${item.reasonCode}` : ""}</p></div><div className="flex items-center gap-2"><Badge tone={item.outcome === "PASSED" ? "success" : item.outcome === "FAILED" ? "danger" : "warning"}>{item.outcome === "PASSED" ? "Validou" : item.outcome === "FAILED" ? "Falhou" : "Inconclusiva"}</Badge><span className="text-xs text-muted">{formatDateTime(item.checkedAt, ctx.timezone)}</span></div></div>)}</div>}</CardBody></Card>
      <Card><CardHeader title="Alertas relacionados à fonte" description="Alertas associados ao cadastro de origem desta execução." /><CardBody>{!result.alerts.length ? <p className="text-sm text-muted">Nenhum alerta relacionado.</p> : <div className="divide-y divide-border">{result.alerts.map((alert, index) => <div key={`${alert.code}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium">{alert.code}</p><p className="mt-1 text-xs text-muted">{alert.occurrences} ocorrência(s) · última em {formatDateTime(alert.lastSeenAt, ctx.timezone)}</p></div><Badge tone={alert.state === "OPEN" ? "warning" : alert.state === "ACKNOWLEDGED" ? "info" : "neutral"}>{alert.state === "OPEN" ? "Aberto" : alert.state === "ACKNOWLEDGED" ? "Reconhecido" : "Resolvido"}</Badge></div>)}</div>}</CardBody></Card>
    </div>
  );
}
