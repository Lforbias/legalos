import Link from "next/link";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { allReadiness } from "@/lib/connectors/registry";
import { getMonitoringOverview } from "@/server/services/monitoring.service";
import { auditImportedTasks } from "@/server/services/import-audit.service";
import { formatDateTime } from "@/lib/dates/format";
import { TASK_STATUS_LABEL, TASK_STATUSES } from "@/modules/tasks/schemas";
export const metadata = { title: "Operação do BOX" };
export default async function BoxOperationPage({ searchParams }: { searchParams: Promise<{ auditar?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "integrations:manage")) return <AccessDenied />;
  const overview = await getMonitoringOverview(ctx);
  const sp = await searchParams;
  const audit = sp.auditar === "1" && can(ctx, "organization:manage") && can(ctx, "tasks:read") ? await auditImportedTasks(ctx) : null;
  const adapter = process.env.PETITIONING_ADAPTER ?? "demo";
  return <div className="mx-auto max-w-6xl space-y-4"><PageHeader title="Operação do BOX" description="Configuração, evidências de captura e conferência do histórico importado." />
    <Card><CardHeader title="Captura de intimações" /><CardBody className="space-y-2 text-sm">
      {!overview.sources.length ? <Alert tone="warning">Nenhuma OAB ou conexão de tribunal cadastrada. A importação do histórico não ativa captura automática.</Alert> : overview.sources.map(s => <p key={`${s.kind}:${s.id}`}><strong>{s.kind} · {s.label}</strong> — {s.health === "NEVER" ? "Nunca verificada" : s.health === "OFF" ? "Desligada" : s.health === "ERROR" ? "Falhou" : s.health === "STALE" ? "Sem verificação recente" : "Última verificação sem erro"}{s.lastSyncAt ? ` · ${formatDateTime(s.lastSyncAt, ctx.timezone)}` : ""}</p>)}
      <p>Últimos 7 dias: {overview.bySource.captured} registros com origem DJEN/PJe, {overview.bySource.otherImports} de outras importações e {overview.bySource.manual} manuais/arquivo.</p>
      <p>A verificação sem erro comprova a consulta, mas não garante que existiam publicações novas. Confira uma publicação conhecida no tribunal após configurar. O administrador da plataforma deve conferir as rotinas DJEN/MNI e o agendador no painel de rotinas.</p>
      <Link className="underline" href="/integracoes">Configurar OAB e conexões</Link> · <Link className="underline" href="/monitoramento">Saúde das fontes</Link>
    </CardBody></Card>
    <Card><CardHeader title="Peticionamento e conectores" /><CardBody className="space-y-3 text-sm">
      <Alert tone={adapter === "demo" ? "warning" : "info"}>{adapter === "demo" ? "Modo demonstração ativo: nenhum protocolo real é enviado ao tribunal." : "Adaptador real selecionado. A configuração, sozinha, não comprova homologação."}</Alert>
      {allReadiness().map(r => <p key={r.system}><strong>{r.label}</strong> — {r.message}</p>)}
      <p>Para liberar o uso operacional: cadastrar certificado e conexão, validar consulta/autos em homologação e conferir envio, recibo e tratamento de falha. A validação real permanece pendente até haver acesso de testes.</p>
      <Link className="underline" href="/certificados">Certificados</Link> · <Link className="underline" href="/peticoes">Petições e recibos</Link>
    </CardBody></Card>
    {can(ctx, "organization:manage") && can(ctx, "tasks:read") ? <Card><CardHeader title="Auditoria das tarefas migradas" description="Somente leitura. Não altera status e não presume que uma conclusão antiga impede reabertura." /><CardBody className="space-y-3 text-sm">
      {!audit ? <Link className="underline" href="/box/operacao?auditar=1">Conferir tarefas importadas do Astrea</Link> : <><p>{audit.checked} tarefas importadas ainda abertas conferidas; {audit.candidateCount} com nota antiga de conclusão.</p><Alert tone="info">São indícios para revisão. Compare o campo Realizada do CSV original e o histórico de reabertura antes de corrigir. Nenhuma tarefa foi alterada.</Alert><ul className="space-y-2">{audit.candidates.map(t => <li key={t.id}><Link className="underline" href={`/tarefas/${t.id}`}>{t.title}</Link> · {TASK_STATUS_LABEL[t.status as typeof TASK_STATUSES[number]]} · atualizada em {formatDateTime(t.updatedAt, ctx.timezone)}</li>)}</ul>{audit.candidateCount > audit.candidates.length ? <p>Exibindo as primeiras 100 ocorrências. O diagnóstico completo também está disponível pelo comando audit:astrea-tasks no servidor.</p> : null}</>}
    </CardBody></Card> : null}
  </div>;
}
