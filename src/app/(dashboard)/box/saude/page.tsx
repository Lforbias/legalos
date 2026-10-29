import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { formatDate, formatDateTime, relativeTime } from "@/lib/dates/format";
import { boxV2Enabled } from "@/lib/features";
import { COVERAGE_LEVEL_LABEL, type CoverageLevel } from "@/lib/judicial/evidence";
import { computeOrgHealth, getJobHealth, listAlerts, listRecentRuns } from "@/server/judicial/health.service";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { AcknowledgeButton, RecheckButton } from "@/modules/box/alert-controls";
import { SEVERITY_TONE, SeverityBadge } from "@/modules/box/present";

export const metadata: Metadata = { title: "Operação e Saúde" };

const KIND_NAME = { DJEN: "DJEN", MNI: "Tribunal (PJe/eproc)", PORTAL: "Portal do tribunal" } as const;
const RUN_STATUS: Record<string, string> = { RUNNING: "Em andamento", SUCCEEDED: "Concluída", PARTIAL: "Parcial", FAILED: "Falhou", INTERRUPTED: "Interrompida" };
const JOB_LEVEL: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = { OK: { label: "No horário", tone: "success" }, LATE: { label: "Atrasada", tone: "warning" }, STALLED: { label: "Parada", tone: "danger" } };
const ALERT_STATE: Record<string, string> = { OPEN: "Aberto", ACKNOWLEDGED: "Ciente" };

export default async function HealthPage() {
  const { ctx } = await requireTenant();
  if (!boxV2Enabled(ctx.organizationId)) notFound();
  if (!can(ctx, "inbox:read")) return <AccessDenied />;
  const admin = can(ctx, "integrations:manage");
  const now = new Date();

  const health = await computeOrgHealth(ctx.organizationId, { now, includeJobs: false });
  const adminData = admin
    ? await Promise.all([
        listAlerts(ctx),
        listRecentRuns(ctx),
        getJobHealth(["djen", "mni", "robots", "monitoring"], now),
        can(ctx, "certificates:manage") ? db.certificate.findMany({ where: { organizationId: ctx.organizationId, revokedAt: null }, orderBy: { notAfter: "asc" }, take: 50, select: { id: true, label: true, notAfter: true, consultationOnly: true } }) : Promise.resolve([]),
        db.jobRun.findFirst({ where: { job: "monitoring", status: "OK" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
      ]).then(([alerts, runs, jobs, certs, lastCheck]) => ({ alerts, runs, jobs, certs, lastCheck }))
    : null;

  const overallTone = health.severity;
  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="box-health">
      <PageHeader
        title="Operação e Saúde"
        description="O que está em dia, o que está parado e o que precisa de uma pessoa. A situação é recalculada de 5 em 5 minutos."
        actions={admin ? <RecheckButton /> : null}
      />

      <Alert tone={overallTone === "OK" ? "success" : overallTone === "CRITICAL" ? "error" : "warning"}>
        {health.sources.length === 0
          ? "Nenhuma fonte configurada: nada está sendo capturado automaticamente."
          : overallTone === "OK"
            ? "Todas as fontes ligadas estão em dia."
            : overallTone === "CRITICAL"
              ? "Há fonte parada ou com falha grave: publicações podem estar sem captura. Veja abaixo o que fazer."
              : "Há itens que pedem atenção. Veja abaixo."}
        {adminData?.lastCheck ? <span className="mt-1 block text-xs opacity-80">Última verificação automática: {relativeTime(adminData.lastCheck.startedAt)}.</span> : null}
        {adminData && !adminData.lastCheck ? <span className="mt-1 block text-xs opacity-80">A verificação automática ainda não rodou neste servidor: confira o agendamento (rotina “Saúde e alertas do Box”).</span> : null}
      </Alert>

      <Card>
        <CardHeader title="Fontes" description="Situação de cada fonte, calculada a partir das consultas concluídas." />
        {health.sources.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">Nenhuma fonte configurada. {admin ? <Link href="/box/configurar" className="text-primary-text hover:underline">Abrir o assistente de configuração</Link> : "Peça a quem administra o escritório para configurar."}</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-border" data-testid="source-health">
            {health.sources.map((s) => (
              <li key={`${s.kind}:${s.id}`} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{KIND_NAME[s.kind as keyof typeof KIND_NAME] ?? s.kind} · {s.label} <span className="font-normal text-muted">({s.detail})</span></p>
                  <p className="mt-1 text-sm leading-6">{s.headline}</p>
                  <p className="mt-1 text-xs text-muted">
                    Última consulta concluída: {s.lastSuccessAt ? `${relativeTime(s.lastSuccessAt)} (${formatDateTime(s.lastSuccessAt, ctx.timezone)})` : "nunca"}
                    {s.runningSince ? ` · consulta em andamento desde ${formatDateTime(s.runningSince, ctx.timezone)}` : ""}
                  </p>
                  {admin && s.lastMessage ? <p className="mt-1 text-xs text-muted">Mensagem da fonte: {s.lastMessage}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {!s.enabled ? <Badge>Desligada</Badge> : <SeverityBadge severity={s.severity} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {adminData ? (
        <>
          <Card>
            <CardHeader title="Alertas" description="Cada problema aparece uma vez, reabre se voltar e some sozinho quando se resolve. Os administradores são avisados quando um alerta abre ou piora." />
            {adminData.alerts.length === 0 ? (
              <CardBody><p className="text-sm text-muted" data-testid="no-alerts">Nenhum alerta aberto.</p></CardBody>
            ) : (
              <ul className="divide-y divide-border" data-testid="alerts">
                {adminData.alerts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={SEVERITY_TONE[a.severity as "INFO" | "WARNING" | "CRITICAL"] ?? "neutral"}>{a.severity === "CRITICAL" ? "Crítico" : a.severity === "WARNING" ? "Atenção" : "Informativo"}</Badge>
                        <Badge>{ALERT_STATE[a.state] ?? a.state}</Badge>
                        <span className="text-xs text-muted">{a.code}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium">{a.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{a.body}</p>
                      <p className="mt-1 text-xs text-muted">Desde {formatDateTime(a.firstSeenAt, ctx.timezone)} · visto {a.occurrences} vez(es) · último em {formatDateTime(a.lastSeenAt, ctx.timezone)}</p>
                    </div>
                    {a.state === "OPEN" ? <AcknowledgeButton id={a.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Rotinas agendadas" description="Se uma rotina para de rodar, nada é capturado — mesmo que a fonte esteja boa." />
            <ul className="divide-y divide-border" data-testid="jobs">
              {adminData.jobs.map((j) => (
                <li key={j.key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>{j.label} <span className="text-xs text-muted">(a cada {j.everyMin} min)</span></span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted">{j.lastOkAt ? `última boa ${relativeTime(j.lastOkAt)}` : "nunca rodou"}</span>
                    <Badge tone={JOB_LEVEL[j.level]!.tone}>{JOB_LEVEL[j.level]!.label}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Execuções recentes" description="O que cada consulta fez: páginas lidas, publicações novas e o que foi comprovado." />
            {adminData.runs.length === 0 ? (
              <CardBody><p className="text-sm text-muted">Nenhuma execução registrada ainda.</p></CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm" data-testid="runs">
                  <thead className="text-xs text-muted"><tr><th className="px-5 py-2 font-medium">Início</th><th className="pr-3 font-medium">Fonte</th><th className="pr-3 font-medium">Origem</th><th className="pr-3 font-medium">Situação</th><th className="pr-3 font-medium">Lidas</th><th className="pr-3 font-medium">Novas</th><th className="pr-3 font-medium">Comprovação</th><th className="pr-5 font-medium">Erro</th></tr></thead>
                  <tbody>
                    {adminData.runs.map((r) => (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="px-5 py-2 text-xs">{formatDateTime(r.startedAt, ctx.timezone)}</td>
                        <td className="pr-3 text-xs">{r.sourceKind}</td>
                        <td className="pr-3 text-xs">{r.trigger === "CRON" ? "Automática" : r.trigger === "ONBOARDING" ? "Configuração" : r.trigger === "RETRY" ? "Nova tentativa" : "Manual"}</td>
                        <td className="pr-3 text-xs">{RUN_STATUS[r.status] ?? r.status}</td>
                        <td className="pr-3 text-xs tabular-nums">{r.fetched}</td>
                        <td className="pr-3 text-xs tabular-nums">{r.createdCount}</td>
                        <td className="pr-3 text-xs">{r.coverage ? (COVERAGE_LEVEL_LABEL[r.coverage as CoverageLevel] ?? r.coverage) : "—"}</td>
                        <td className="pr-5 text-xs">{r.errorCode ? `${r.errorCode}${r.errorMessage ? ` — ${r.errorMessage}` : ""}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {adminData.certs.length ? (
            <Card>
              <CardHeader title="Certificados digitais" description="Alertas de vencimento aos 30, 15 e 7 dias, e quando vencer." />
              <ul className="divide-y divide-border" data-testid="certs">
                {adminData.certs.map((c) => {
                  const days = Math.ceil((c.notAfter.getTime() - now.getTime()) / 86_400_000);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                      <span>{c.label} <span className="text-xs text-muted">{c.consultationOnly ? "· somente consulta" : "· consulta e assinatura"}</span></span>
                      <span className="flex items-center gap-2"><span className="text-xs text-muted">vence em {formatDate(c.notAfter, ctx.timezone)}</span><Badge tone={days < 0 ? "danger" : days <= 30 ? "warning" : "success"}>{days < 0 ? "vencido" : `${days} dia(s)`}</Badge></span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">Os detalhes técnicos (execuções, rotinas e alertas) ficam com quem administra as integrações do escritório.</p>
      )}
    </div>
  );
}
