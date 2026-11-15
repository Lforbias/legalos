import { BOX_AVAILABLE, isBoxPermission, isBoxEvent } from "@/lib/box-retirement";
import { formatDateTime } from "@/lib/dates/format";
import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MonitorForm, MonitorList } from "@/modules/djen/djen-ui";
import { UFS } from "@/lib/mni/tribunals";
import { listMonitors } from "@/server/services/djen.service";
import { DatajudKeyForm, DatajudToggle } from "@/modules/organizations/datajud-toggle";
import { ApiKeyForm, ApiKeyList } from "@/modules/api-keys/api-keys-ui";
import { API_SCOPES, listApiKeys } from "@/server/services/apikey.service";
import { WebhookForm, WebhookList } from "@/modules/webhooks/webhooks-ui";
import { listWebhooks, recentDeliveries, webhooksAvailable, WEBHOOK_EVENTS } from "@/server/services/webhook.service";
import { can } from "@/server/context";
import { datajudStatus } from "@/server/services/datajud.service";
import { DriveSettingsPanel } from "@/modules/google/google-ui";
import { getDriveSettings } from "@/server/services/google-drive.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Integrações" };

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ google?: string; msg?: string }> }) {
  const { ctx } = await requireTenant();
  const canManageIntegrations = can(ctx, "integrations:manage");
  if (!canManageIntegrations && !can(ctx, "cases:write")) return <AccessDenied />;
  const sp = await searchParams;
  if (!canManageIntegrations) {
    const [monitors, datajud] = await Promise.all([listMonitors(ctx), datajudStatus(ctx)]);
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Integrações" description="Configure fontes públicas que complementam os processos do escritório." />
        <Card>
          <CardHeader title="DJEN — publicações por OAB" description="Cadastre a OAB do advogado para consultar publicações públicas." action={monitors.some((m) => m.enabled) ? <Badge tone="success">Monitoramento ativo</Badge> : <Badge tone="warning">Sem monitoramento ativo</Badge>} />
          <CardBody className="space-y-4 text-sm">
            <p>Informe o nome, número da OAB e seccional. A consulta pública não precisa de senha nem certificado. Depois do cadastro, use “Verificar agora”; as publicações aparecem na Central Judicial e no processo correspondente.</p>
            <MonitorList items={monitors.map((m) => ({ id: m.id, label: m.label, oabNumber: m.oabNumber, oabUf: m.oabUf, enabled: m.enabled, lastSyncAt: m.lastSyncAt ? m.lastSyncAt.toISOString() : null, lastStatus: m.lastStatus, lastMessage: m.lastMessage, defaultAssigneeId: m.defaultAssigneeId, defaultTeamId: m.defaultTeamId }))} />
            <MonitorForm ufs={UFS} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="DataJud (CNJ)" action={datajud.keyConfigured && datajud.orgEnabled ? <Badge tone="info">Consulta habilitada</Badge> : <Badge tone="warning">Aguardando configuração</Badge>} />
          <CardBody className="text-sm text-muted">O DataJud consulta andamentos pelo número CNJ de cada processo. A chave e a ativação são gerenciadas por um administrador em Integrações.</CardBody>
        </Card>
      </div>
    );
  }
  const drive = await getDriveSettings(ctx);
  const s = await datajudStatus(ctx);
  const monitors = await listMonitors(ctx);
  const apiKeys = await listApiKeys(ctx);
  const scopeLabels = Object.fromEntries(Object.entries(API_SCOPES).map(([k, v]) => [k, v.label]));
  const scopeOptions = Object.entries(API_SCOPES).filter(([key, v]) => key !== "legalmail:ingest" && (BOX_AVAILABLE || (!key.startsWith("pje:") && !isBoxPermission(v.permission)))).map(([key, v]) => ({ key, label: v.label, allowed: can(ctx, v.permission) }));
  const [hooks, deliveries] = await Promise.all([listWebhooks(ctx), recentDeliveries(ctx)]);
  const eventLabels: Record<string, string> = { ...WEBHOOK_EVENTS, ping: "Teste" };
  const eventOptions = Object.entries(WEBHOOK_EVENTS).filter(([key]) => BOX_AVAILABLE || !isBoxEvent(key)).map(([key, label]) => ({ key, label }));
  const active = s.keyConfigured && s.orgEnabled;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Integrações" description="Conectores reais, sempre desligados até haver credenciais e consentimento do escritório." />
      <div className="space-y-4">
        {sp.google === "ok" ? <Alert tone="success">Google conectado. Falta só ligar o Drive neste escritório.</Alert> : null}
        {sp.google === "erro" ? <Alert tone="error">Não foi possível conectar ao Google{sp.msg ? `: ${sp.msg.slice(0, 160)}` : "."}</Alert> : null}
        <Card>
          <CardHeader title="Google Drive / Docs (opcional)" action={drive.enabled ? <Badge tone="success">Ligado</Badge> : <Badge tone="warning">Desligado</Badge>} />
          <CardBody className="space-y-3 text-sm">
            <p>Envie documentos ao Drive do escritório, edite no Google Docs e traga a edição de volta como nova versão. Cada escritório usa a própria conta e as próprias credenciais do Google (nada é compartilhado entre escritórios, nem há chave global). O acesso é limitado ao que o LegalOS cria (escopo drive.file) e processos sigilosos nunca são enviados.</p>
            <DriveSettingsPanel s={drive} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="DataJud (CNJ)" action={active ? <Badge tone="info">Consulta habilitada</Badge> : <Badge tone="warning">Desligada</Badge>} />
          <CardBody className="space-y-3 text-sm">
            <p>Importa os andamentos públicos de um processo a partir do número CNJ (Justiça Estadual, Federal, do Trabalho, Eleitoral, STJ e TST). Só o número do processo é enviado ao CNJ; processos sigilosos nunca são consultados. Cada andamento é importado uma única vez.</p>
            {!s.keyConfigured ? <Alert tone="warning">Cadastre a chave pública do DataJud abaixo para habilitar a consulta.</Alert> : null}
            <p className="text-xs text-muted">Fonte: Conselho Nacional de Justiça (CNJ), Base Nacional de Dados do Poder Judiciário (DataJud). Habilitar a consulta não confirma a disponibilidade do CNJ.</p>
            <p className="text-xs" role="status">{s.lastTest ? `Último teste: ${formatDateTime(s.lastTest.at, ctx.timezone)} — ${s.lastTest.ok ? "autenticação aceita pelo CNJ" : ({ TIMEOUT: "tempo de resposta esgotado", NETWORK: "falha de conexão", AUTH: "acesso recusado (chave ou permissão)", RATE_LIMIT: "limite de consultas atingido", UNAVAILABLE: "serviço indisponível ou resposta incompleta", INVALID_RESPONSE: "resposta inválida" }[s.lastTest.reason ?? ""] ?? "não concluído")}.` : "Conexão ainda não testada com a chave atual."}</p>
            <DatajudKeyForm ownKey={s.ownKey} vaultAvailable={s.vaultAvailable} configured={s.keyConfigured} />
            {s.keyConfigured ? <DatajudToggle enabled={s.orgEnabled} /> : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="DJEN — publicações por OAB" action={monitors.some((m) => m.enabled) ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Desligado</Badge>} />
          <CardBody className="space-y-4 text-sm">
            <p>Consulta a base pública do Diário de Justiça Eletrônico Nacional pela OAB do advogado. Não precisa de senha nem certificado. Use “Verificar agora” para buscar; a consulta automática depende de agendador do ambiente.</p>
            <MonitorList items={monitors.map((m) => ({ id: m.id, label: m.label, oabNumber: m.oabNumber, oabUf: m.oabUf, enabled: m.enabled, lastSyncAt: m.lastSyncAt ? m.lastSyncAt.toISOString() : null, lastStatus: m.lastStatus, lastMessage: m.lastMessage, defaultAssigneeId: m.defaultAssigneeId, defaultTeamId: m.defaultTeamId }))} />
            <MonitorForm ufs={UFS} />
          </CardBody>
        </Card>
        <Alert tone="info">Google Agenda, Gmail e envio de e-mail ficam para uma próxima etapa.</Alert>
        <Card>
          <CardHeader title="API do LegalOS — chaves de acesso" action={apiKeys.some((k) => k.status === "ACTIVE") ? <Badge tone="success">Em uso</Badge> : <Badge tone="warning">Sem chaves</Badge>} />
          <CardBody className="space-y-4 text-sm">
            <p>Permite que outros sistemas (planilhas, automações, o site do escritório) leiam processos, clientes e prazos. A chave age com as mesmas permissões e regras de sigilo de quem a criou, limitada aos acessos marcados, e para de funcionar se essa pessoa sair do escritório. Guarde a chave como uma senha. Documentação: docs/api.md.</p>
            <p className="text-xs text-muted">Contrato OpenAPI atualizado e filtrado pelos acessos da chave: <code>GET /api/v1/openapi</code>. Consulte os escopos e exemplos em docs/api.md.</p>
            <ApiKeyList items={apiKeys.map((k) => ({ ...k, expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null, lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null, createdAt: k.createdAt.toISOString() }))} scopeLabels={scopeLabels} />
            <ApiKeyForm scopes={scopeOptions} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Webhooks — avisos para outros sistemas" action={hooks.some((h) => h.enabled) ? <Badge tone="success">Em uso</Badge> : <Badge tone="warning">Nenhum ativo</Badge>} />
          <CardBody className="space-y-4 text-sm">
            <p>O LegalOS envia um aviso (POST em JSON, assinado) ao endereço que você cadastrar sempre que algo acontece: processo ou prazo cadastrado. O aviso traz só identificadores; o sistema receptor busca os detalhes pela API usando uma chave. Entregas que falham são repetidas (1 min, 5 min, 30 min, 2 h e 6 h) e dá para reenviar manualmente. A entrega depende de um agendador chamando o sistema a cada minuto (CRON_SECRET; veja docs/api.md). Assinatura, formato e verificação estão em docs/api.md.</p>
            {!webhooksAvailable() ? <Alert tone="warning">Falta a chave de cifra do sistema (MFA_ENCRYPTION_KEY): webhooks ficam indisponíveis.</Alert> : null}
            <WebhookList items={hooks.map((h) => ({ id: h.id, name: h.name, url: h.url, events: h.events, enabled: h.enabled, disabledReason: h.disabledReason, lastSuccessAt: h.lastSuccessAt ? h.lastSuccessAt.toISOString() : null }))} deliveries={deliveries.map((d) => ({ id: d.id, endpoint: d.endpoint.name, eventType: d.eventType, status: d.status as "PENDING" | "SUCCEEDED" | "FAILED", attempts: d.attempts, lastStatusCode: d.lastStatusCode, lastError: d.lastError, createdAt: d.createdAt.toISOString() }))} eventLabels={eventLabels} />
            {webhooksAvailable() ? <WebhookForm events={eventOptions} /> : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
