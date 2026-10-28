import Link from "next/link";
import { formatDateTime } from "@/lib/dates/format";
import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MonitorForm, MonitorList } from "@/modules/djen/djen-ui";
import { listMonitors } from "@/server/services/djen.service";
import { listActiveMembers } from "@/server/services/members";
import { listTeams } from "@/server/services/inbox-flow.service";
import { UFS } from "@/lib/mni/tribunals";
import { OfficialTargetsForm, ConnectionForm, ConnectionList } from "@/modules/mni/mni-ui";
import { listTribunals } from "@/lib/mni/tribunals";
import { listCertificates, vaultAvailable } from "@/server/services/certificate.service";
import { listConnections } from "@/server/services/mni.service";
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
  if (!can(ctx, "integrations:manage")) return <AccessDenied />;
  const sp = await searchParams;
  const drive = await getDriveSettings(ctx);
  const s = await datajudStatus(ctx);
  const monitors = await listMonitors(ctx);
  const [rcvMembers, rcvTeams] = await Promise.all([listActiveMembers(ctx), listTeams(ctx)]);
  const tribunals = listTribunals();
  const names = new Map(tribunals.map((t) => [t.jtr, t.label]));
  const vault = vaultAvailable();
  const [conns, certs] = await Promise.all([listConnections(ctx), vault && can(ctx, "certificates:manage") ? listCertificates(ctx) : Promise.resolve([])]);
  const usableCerts = certs.filter((c) => c.status === "ACTIVE" || c.status === "EXPIRING").map((c) => ({ id: c.id, label: c.label }));
  const apiKeys = await listApiKeys(ctx);
  const scopeLabels = Object.fromEntries(Object.entries(API_SCOPES).map(([k, v]) => [k, v.label]));
  const scopeOptions = Object.entries(API_SCOPES).map(([key, v]) => ({ key, label: v.label, allowed: can(ctx, v.permission) }));
  const [hooks, deliveries] = await Promise.all([listWebhooks(ctx), recentDeliveries(ctx)]);
  const eventLabels: Record<string, string> = { ...WEBHOOK_EVENTS, ping: "Teste" };
  const eventOptions = Object.entries(WEBHOOK_EVENTS).map(([key, label]) => ({ key, label }));
  const active = s.keyConfigured && s.orgEnabled;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Integrações" description="Conectores reais, sempre desligados até haver credenciais e consentimento do escritório." />
      <div className="space-y-4">
        <Card>
          <CardHeader title="Conectar o PJe" description="O caminho simples: seu login do PJe, uma vez, e o LegalOS entra por você." action={<Link href="/integracoes/pje" className="text-sm font-medium text-primary-text underline">Conectar agora</Link>} />
        </Card>
        <Link href="/integracoes/diagnostico" className="inline-block text-sm text-primary-text underline">Abrir diagnóstico de WhatsApp, tribunais e migração</Link>
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
            <p>Consulta a base pública do Diário de Justiça Eletrônico Nacional pela OAB do advogado e coloca as publicações na caixa de entrada, sem repetir. Não precisa de certificado nem de senha. A verificação automática depende de um agendador chamar o sistema (variável CRON_SECRET); sem isso, use “Verificar agora”. Esta consulta pública não tem documentação oficial estável: se o CNJ mudar o formato, o sistema avisa em vez de importar dados incorretos. Relatos indicam que o DJEN recusa servidores fora do Brasil.</p>
            <MonitorList items={monitors.map((m) => ({ id: m.id, label: m.label, oabNumber: m.oabNumber, oabUf: m.oabUf, enabled: m.enabled, lastSyncAt: m.lastSyncAt ? m.lastSyncAt.toISOString() : null, lastStatus: m.lastStatus, lastMessage: m.lastMessage, defaultAssigneeId: m.defaultAssigneeId, defaultTeamId: m.defaultTeamId }))} recipients={{ members: rcvMembers.map((u) => ({ id: u.id, name: u.name })), teams: rcvTeams.map((t) => ({ id: t.id, name: t.name })) }} />
            <MonitorForm ufs={UFS} />
          </CardBody>
        </Card>
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">Avançado: conexão oficial MNI (exige autorização do tribunal e liberação de IP)</summary>
          <div className="mt-4">
        <Card>
          <CardHeader title="Conexões de tribunais — MNI 2.2.2" action={conns.some((c) => c.enabled) ? <Badge tone="info">Habilitada (acesso não confirmado)</Badge> : <Badge tone="warning">Desligada</Badge>} />
          <CardBody className="space-y-4 text-sm">
            <p>Conexões de PJe, eproc, e-SAJ e PROJUDI que disponibilizem MNI 2.2.2. MNI 3.0 e webservices proprietários ainda exigem adaptadores específicos. Lista os avisos pendentes sem abrir o teor (abrir geraria ciência e abriria o prazo) e consulta movimentos de um processo. Ainda não foi validado contra um tribunal real: use primeiro um tribunal que tenha ambiente de homologação e confirme com ele o endereço e a forma de autenticação.</p>
            {!vault ? <Alert tone="warning">Falta a chave do cofre (CERT_ENCRYPTION_KEY): cadastro de conexões fica indisponível.</Alert> : null}
            {vault ? <OfficialTargetsForm certificates={usableCerts} /> : null}
            <ConnectionList items={conns.map((c) => ({ wsdlUrl: c.wsdlUrl, authProfile: c.authProfile, system: c.system, environment: c.environment, wsdlStatus: c.wsdlStatus, wsdlCheckedAt: c.wsdlCheckedAt?.toISOString() ?? null, wsdlOperations: c.wsdlOperations, id: c.id, label: c.label, jtr: c.jtr, tribunal: names.get(c.jtr) ?? c.jtr, endpointUrl: c.endpointUrl, authMode: c.authMode, certificateLabel: c.certificateLabel, enabled: c.enabled, lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null, lastStatus: c.lastStatus, lastMessage: c.lastMessage, petitionTypes: c.petitionTypes }))} />
            {vault ? <ConnectionForm tribunals={tribunals.map((t) => ({ jtr: t.jtr, label: t.label }))} certificates={usableCerts} /> : null}
          </CardBody>
        </Card>
          </div>
        </details>
        <Alert tone="info">Google Agenda, Gmail e envio de e-mail ficam para uma próxima etapa.</Alert>
        <Card>
          <CardHeader title="API do LegalOS — chaves de acesso" action={apiKeys.some((k) => k.status === "ACTIVE") ? <Badge tone="success">Em uso</Badge> : <Badge tone="warning">Sem chaves</Badge>} />
          <CardBody className="space-y-4 text-sm">
            <p>Permite que outros sistemas (planilhas, automações, o site do escritório) leiam processos, clientes, prazos e intimações e registrem intimações. A chave age com as mesmas permissões e regras de sigilo de quem a criou, limitada aos acessos marcados, e para de funcionar se essa pessoa sair do escritório. Guarde a chave como uma senha. Documentação: docs/api.md.</p>
            <ApiKeyList items={apiKeys.map((k) => ({ ...k, expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null, lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null, createdAt: k.createdAt.toISOString() }))} scopeLabels={scopeLabels} />
            <ApiKeyForm scopes={scopeOptions} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Webhooks — avisos para outros sistemas" action={hooks.some((h) => h.enabled) ? <Badge tone="success">Em uso</Badge> : <Badge tone="warning">Nenhum ativo</Badge>} />
          <CardBody className="space-y-4 text-sm">
            <p>O LegalOS envia um aviso (POST em JSON, assinado) ao endereço que você cadastrar sempre que algo acontece: intimação registrada, processo ou prazo cadastrado. O aviso traz só identificadores; o sistema receptor busca os detalhes pela API usando uma chave. Entregas que falham são repetidas (1 min, 5 min, 30 min, 2 h e 6 h) e dá para reenviar manualmente. A entrega depende de um agendador chamando o sistema a cada minuto (CRON_SECRET; veja docs/api.md). Assinatura, formato e verificação estão em docs/api.md.</p>
            {!webhooksAvailable() ? <Alert tone="warning">Falta a chave de cifra do sistema (MFA_ENCRYPTION_KEY): webhooks ficam indisponíveis.</Alert> : null}
            <WebhookList items={hooks.map((h) => ({ id: h.id, name: h.name, url: h.url, events: h.events, enabled: h.enabled, disabledReason: h.disabledReason, lastSuccessAt: h.lastSuccessAt ? h.lastSuccessAt.toISOString() : null }))} deliveries={deliveries.map((d) => ({ id: d.id, endpoint: d.endpoint.name, eventType: d.eventType, status: d.status as "PENDING" | "SUCCEEDED" | "FAILED", attempts: d.attempts, lastStatusCode: d.lastStatusCode, lastError: d.lastError, createdAt: d.createdAt.toISOString() }))} eventLabels={eventLabels} />
            {webhooksAvailable() ? <WebhookForm events={eventOptions} /> : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
