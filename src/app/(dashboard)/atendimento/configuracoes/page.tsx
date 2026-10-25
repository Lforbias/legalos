import { LifecycleAccountForm } from "@/modules/whatsapp/operations-ui";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatWaId } from "@/lib/whatsapp/phone";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { getAccount, listQuickReplies, listTemplatesLocal, webhookConfigured, whatsappKeyAvailable } from "@/server/services/whatsapp-account.service";
import { listAgents, listQueues, listTeamsForQueues } from "@/server/services/chat-queue.service";
import { getBot } from "@/server/services/chat-bot.service";
import { BotPanel } from "@/modules/whatsapp/bot-ui";
import { SwitchesPanel } from "@/modules/whatsapp/switches-ui";
import { SlaPanel } from "@/modules/whatsapp/sla-ui";
import { TriagePanel } from "@/modules/whatsapp/triage-ui";
import { getSla } from "@/server/services/chat-sla.service";
import { getSwitches } from "@/server/services/chat-switches.service";
import { BillingPanel } from "@/modules/whatsapp/billing-ui";
import { getBillingSettings, listBillingSends, listOptouts } from "@/server/services/chat-billing.service";
import { listAutomationRuns, listAutomations } from "@/server/services/chat-automation.service";
import { AutomationsPanel } from "@/modules/whatsapp/automations-ui";
import { listFields, listLabels } from "@/server/services/chat-meta.service";
import { listNumbers, MAX_NUMBERS } from "@/server/services/whatsapp-numbers.service";
import { getExtrasSettings, listForms } from "@/server/services/chat-extras.service";
import { ExtrasSettingsPanel, FormsPanel, NumbersPanel } from "@/modules/whatsapp/extras-ui";
import { CampaignsPanel, DialogsPanel, Extras40Switches, IntentsPanel, ToolsAdminPanel } from "@/modules/whatsapp/tools-ui";
import { listCampaigns } from "@/server/services/chat-campaigns.service";
import { listDialogRuns, listDialogs, listIntents } from "@/server/services/chat-dialogs.service";
import { listChatStatuses, listChecklists, listLibrary } from "@/server/services/chat-tools.service";
import { db } from "@/lib/db/client";
import { hasModule } from "@/server/services/org-security.service";
import { AccountActions, AwayForm, ConnectForm, FieldsPanel, LabelsPanel, QrConnect, QrPanel, QueuesPanel, QuickReplies, SyncTemplates } from "@/modules/whatsapp/settings-ui";

export const metadata: Metadata = { title: "Configurações do Chat" };
export const dynamic = "force-dynamic";

export default async function AtendimentoConfigPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "whatsapp:manage")) return <AccessDenied />;
  const [account, quick, templates] = await Promise.all([getAccount(ctx), listQuickReplies(ctx), listTemplatesLocal(ctx, false)]);
  const [queues, teams, agents] = account ? await Promise.all([listQueues(ctx), listTeamsForQueues(ctx), listAgents(ctx)]) : [[], [], []];
  const [labels, fields] = account ? await Promise.all([listLabels(ctx), listFields(ctx)]) : [[], []];
  const [automations, runs] = account ? await Promise.all([listAutomations(ctx), listAutomationRuns(ctx)]) : [[], []];
  const bot = account ? await getBot(ctx) : null;
  const switches = account ? await getSwitches(ctx) : null;
  const [billing, billingSends, optouts] = account ? await Promise.all([getBillingSettings(ctx), listBillingSends(ctx), listOptouts(ctx)]) : [null, [], []];
  const sla = account ? await getSla(ctx) : null;
  const numbers = account ? await listNumbers(ctx) : [];
  const [extras, forms] = account ? await Promise.all([getExtrasSettings(ctx), listForms(ctx)]) : [null, []];
  const tools = account ? await Promise.all([listChatStatuses(ctx), listChecklists(ctx), listLibrary(ctx), listDialogs(ctx), listDialogRuns(ctx, 15), listIntents(ctx)]) : null;
  const campaignsOn = account ? await hasModule(ctx.organizationId, "campanhas") : false;
  const [campaigns, campClients] = account && campaignsOn ? await Promise.all([listCampaigns(ctx), can(ctx,"clients:read")?db.client.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null, phone: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 100 }):Promise.resolve([])]) : [[], []];
  const keyOk = whatsappKeyAvailable();
  const hookOk = webhookConfigured();
  const isQr = account?.provider === "QR";
  return (
    <div className="mx-auto max-w-5xl space-y-5" data-testid="wa-config">
      <PageHeader title="Configurações do Chat" description="Número do WhatsApp (API oficial da Meta ou QR-Code), ausência, respostas rápidas e modelos." actions={<Link className="text-sm underline" href="/atendimento">Voltar às conversas</Link>} />
      <nav aria-label="Assuntos das configurações do Chat" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { id: "chat-conexao", title: "Números e conexão", description: "WhatsApp e credenciais do escritório" },
          ...(account ? [
            { id: "chat-rotina", title: "Rotina de atendimento", description: "Situações, expediente e satisfação" },
            { id: "chat-equipe", title: "Equipe e distribuição", description: "Filas, responsáveis e tempo de resposta" },
            { id: "chat-automacoes", title: "Automações", description: "Triagem, regras e diálogos" },
            { id: "chat-conteudo", title: "Conteúdo e cadastro", description: "Formulários, etiquetas e respostas" },
            ...(extras && tools ? [{ id: "chat-campanhas", title: "Campanhas", description: "Prepare e acompanhe os envios" }] : []),
          ] : []),
        ].map((item) => <a key={item.id} href={`#${item.id}`} className="rounded-xl border border-border bg-surface px-4 py-4 transition-colors hover:border-primary/40 hover:bg-surface-2/40 focus-visible:outline-2 focus-visible:outline-primary"><span className="block text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted">{item.description}</span></a>)}
      </nav>
      {!keyOk ? <Alert tone="warning">Falta a chave do cofre (CERT_ENCRYPTION_KEY): não é possível guardar o token com segurança.</Alert> : null}
      {!hookOk && account?.provider !== "QR" ? <Alert tone="warning">Faltam as variáveis WHATSAPP_APP_SECRET e WHATSAPP_VERIFY_TOKEN (16+ caracteres): o sistema não consegue receber mensagens da Meta. Nada é simulado.</Alert> : null}
      <Card id="chat-conexao" className="scroll-mt-5">
        <CardHeader title="Número conectado" action={account ? (account.enabled ? <Badge tone="success">Ligado</Badge> : <Badge tone="warning">Desligado</Badge>) : <Badge tone="warning">Não conectado</Badge>} />
        <CardBody className="space-y-4 text-sm">
          {account ? (
            <p>
              <Badge tone={isQr ? "warning" : "success"}>{isQr ? "QR-Code (não oficial)" : "API oficial da Meta"}</Badge>{" "}
              {isQr ? `${account.label}${account.qrPhone ? ` · +${account.qrPhone}` : ""}` : `${account.displayPhone ?? account.label} · ID ${account.phoneNumberId}`}
              {account.lastMessage && !isQr ? ` · ${account.lastMessage}` : ""}
            </p>
          ) : <p>Escolha como conectar o número do escritório. Conectar exige verificação em duas etapas ativa na sua conta.</p>}
          {isQr ? <QrPanel /> : null}
          {account ? <AccountActions enabled={account.enabled} /> : null}
        </CardBody>
      </Card>
      {keyOk ? (
        <>
          <Card>
            <CardHeader title="Opção padrão: API oficial da Meta" action={!isQr && account ? <Badge tone="success">Em uso</Badge> : undefined} />
            <CardBody className="space-y-3 text-sm">
              <p>Recomendada: sem risco de banimento, com modelos aprovados e janela de 24 horas. Exige uma conta na Meta (API de Nuvem do WhatsApp).</p>
              <Alert tone="info">No painel da Meta, cadastre o webhook com a URL <code>https://SEU-DOMINIO/api/whatsapp/webhook</code>, o token de verificação igual a WHATSAPP_VERIFY_TOKEN e assine o campo <code>messages</code>.</Alert>
              <ConnectForm connected={!!account && !isQr} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Opção avançada: QR-Code (como o ChatGuru)" action={isQr ? <Badge tone="warning">Em uso</Badge> : undefined} />
            <CardBody className="space-y-3 text-sm">
              <p>Conecta o WhatsApp comum do celular lendo um QR-Code, sem conta na Meta. Não é oficial e traz risco de banimento.</p>
              {!isQr ? <QrConnect connected={!!account} label={account?.label} /> : <p className="text-muted">Esta é a conexão atual. Para trocar para a API oficial, preencha os dados da Meta acima.</p>}
            </CardBody>
          </Card>
        </>
      ) : null}
      {account ? (
        <>
          <Card>
            <CardHeader title="Números do escritório" description="Vários números no mesmo Chat. Cada conversa fica no número que a recebeu." action={<Badge tone="info">{numbers.length} de {MAX_NUMBERS}</Badge>} />
            <CardBody><NumbersPanel numbers={numbers.map((n) => ({ id: n.id, label: n.label, provider: n.provider, isPrimary: n.isPrimary, enabled: n.enabled, phone: n.phone, qrState: n.qrState, conversations: n.conversations }))} max={MAX_NUMBERS} /></CardBody>
          </Card>
          <Card id="chat-rotina" className="scroll-mt-5"><CardHeader title="Situação automática do atendimento" description="Regras por número; status personalizados continuam disponíveis separadamente."/><CardBody className="space-y-3">{numbers.map(n=><LifecycleAccountForm key={n.id} account={n}/>)}</CardBody></Card>
          {switches ? (
            <Card>
              <CardHeader title="Liga e desliga das automações" description="Controle central de tudo o que o Chat faz sozinho." />
              <CardBody><SwitchesPanel sw={switches} /></CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Ausência e expediente" />
            <CardBody><AwayForm initial={{ awayEnabled: account.awayEnabled, awayMessage: account.awayMessage ?? "", openFrom: account.openFrom, openUntil: account.openUntil, openDays: account.openDays }} /></CardBody>
          </Card>
          <Card id="chat-equipe" className="scroll-mt-5">
            <CardHeader title="Filas e distribuição" description="Quem recebe cada conversa nova. Usa as equipes do Box." />
            <CardBody><QueuesPanel queues={queues} teams={teams} agents={agents} /></CardBody>
          </Card>
          <Card id="chat-automacoes" className="scroll-mt-5">
            <CardHeader title="Menu de triagem (chatbot)" description="Recebe a conversa nova, pergunta o assunto e já encaminha para a fila certa." />
            <CardBody>
              <BotPanel
                bot={bot}
                labels={labels.map((l) => ({ id: l.id, name: l.name }))}
                queues={queues.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))}
                agents={agents.map((a) => ({ id: a.id, name: a.name }))}
                fields={fields.filter((f) => f.active).map((f) => ({ id: f.id, name: f.name }))}
              />
            </CardBody>
          </Card>
          {billing ? (
            <Card>
              <CardHeader title="Cobrança de honorários pelo WhatsApp" description="Lembretes automáticos de parcela: antes, no dia e em atraso." />
              <CardBody>
                <BillingPanel
                  settings={billing}
                  templates={templates.map((t) => ({ id: t.id, name: t.name, language: t.language, variableCount: t.variableCount }))}
                  sends={billingSends.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))}
                  optouts={optouts.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() }))}
                />
              </CardBody>
            </Card>
          ) : null}
          {sla ? (
            <Card>
              <CardHeader title="SLA de resposta" description="Avisa a equipe quando um cliente fica sem resposta. Não escreve ao cliente." />
              <CardBody><SlaPanel sla={{ ...sla, recent: sla.recent.map((r) => ({ id: r.id, at: r.at.toISOString(), recipients: r.recipients, who: r.who, conversationId: r.conversationId })) }} agents={agents.map((a) => ({ id: a.id, name: a.name }))} /></CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Triagem por área (modelo)" description="Encaminha a conversa para a fila e o atendente da área quando o cliente escrever certas palavras." />
            <CardBody>
              <TriagePanel
                queues={queues.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))}
                agents={agents.map((a) => ({ id: a.id, name: a.name }))}
                existing={automations.filter((a) => a.name.startsWith("Triagem: ")).map((a) => a.name.replace("Triagem: ", ""))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Automações do Chat" description="Quando acontecer algo na conversa, o sistema faz as ações sozinho." />
            <CardBody>
              <AutomationsPanel
                automations={automations}
                labels={labels.map((l) => ({ id: l.id, name: l.name }))}
                queues={queues.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))}
                agents={agents.map((a) => ({ id: a.id, name: a.name }))}
                runs={runs.map((r) => ({ id: r.id, status: r.status, message: r.message, createdAt: r.createdAt.toISOString(), automation: r.automation.name, who: r.conversation.client?.name ?? r.conversation.contactName ?? formatWaId(r.conversation.waId) }))}
              />
            </CardBody>
          </Card>
          {extras ? (
            <Card>
              <CardHeader title="Agendamento e pesquisa de satisfação" description="Mensagens agendadas pela equipe e NPS. Nascem desligados." />
              <CardBody><ExtrasSettingsPanel s={extras} /></CardBody>
            </Card>
          ) : null}
          {extras && tools ? (
            <>
              <Card>
                <CardHeader title="Recursos automáticos" description="Arquivamento automático, entrega ao responsável, intenções, campanhas e transcrição. Tudo nasce desligado." />
                <CardBody><Extras40Switches s={{ archiveEnabled: extras.archiveEnabled, archiveDays: extras.archiveDays, npsAutoOnClose: extras.npsAutoOnClose, campaignsEnabled: extras.campaignsEnabled, delegateEnabled: extras.delegateEnabled, intentsEnabled: extras.intentsEnabled, transcribeEnabled: extras.transcribeEnabled }} /></CardBody>
              </Card>
              <Card>
                <CardHeader title="Etiquetas prontas, status, checklists e biblioteca" description="Ferramentas para o atendimento do dia a dia." />
                <CardBody><ToolsAdminPanel d={{ statuses: tools[0].map((x) => ({ id: x.id, name: x.name, color: x.color })), checklists: tools[1].map((x) => ({ id: x.id, title: x.title, items: x.items })), library: tools[2].map((x) => ({ id: x.id, title: x.title, fileName: x.fileName, sizeBytes: x.sizeBytes })) }} /></CardBody>
              </Card>
              <Card>
                <CardHeader title="Diálogos programados" description="Reenvio por tempo, aniversário, aviso de audiência e resposta sobre horário." />
                <CardBody><DialogsPanel dialogs={tools[3].map((d) => ({ id: d.id, kind: d.kind, name: d.name, active: d.active, text: d.text, templateId: d.templateId, config: (d.config ?? {}) as Record<string, unknown> }))} templates={templates.filter((t) => t.status === "APPROVED").map((t) => ({ id: t.id, name: t.name }))} runs={tools[4].map((r) => ({ id: r.id, status: r.status, message: r.message, createdAt: r.createdAt.toISOString() }))} /></CardBody>
              </Card>
              <Card>
                <CardHeader title="Reconhecimento de assuntos" description="Reconhece o assunto da mensagem por pontuação de palavras (sem IA)." />
                <CardBody><IntentsPanel intents={tools[5].map((i) => ({ id: i.id, name: i.name, active: i.active, threshold: i.threshold, terms: (Array.isArray(i.terms) ? i.terms : []) as { term: string; weight: number }[], actionsCount: Array.isArray(i.actions) ? i.actions.length : 0 }))} labels={labels.map((l) => ({ id: l.id, name: l.name }))} agents={agents.map((a) => ({ id: a.id, name: a.name }))} queues={queues.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))} /></CardBody>
              </Card>
              <Card id="chat-campanhas" className="scroll-mt-5">
                <CardHeader title="Campanhas em massa" description="Envio controlado: rascunho, aprovação humana e envio gradual." />
                <CardBody>
                  {campaignsOn ? <CampaignsPanel campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status, text: c.text, createdAt: c.createdAt.toISOString(), counts: c.counts }))} clients={campClients} templates={templates.filter((t) => t.status === "APPROVED").map((t) => ({ id: t.id, name: t.name }))} enabled={extras.campaignsEnabled} canApprove={can(ctx, "whatsapp:manage")} isMeta={!isQr} /> : <Alert tone="info">O módulo “Campanhas em massa” não está incluído no plano do escritório.</Alert>}
                </CardBody>
              </Card>
            </>
          ) : null}
          <Card id="chat-conteudo" className="scroll-mt-5">
            <CardHeader title="Formulários de atendimento" description="Listas de campos para preencher durante o atendimento (ex.: triagem por área)." />
            <CardBody><FormsPanel forms={forms.map((f) => ({ id: f.id, name: f.name, active: f.active, fields: f.fields.map((x) => ({ fieldId: x.fieldId, name: x.name, required: x.required })) }))} fields={fields.filter((f) => f.active).map((f) => ({ id: f.id, name: f.name }))} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Etiquetas" description="Marcadores coloridos para organizar e filtrar as conversas." />
            <CardBody><LabelsPanel labels={labels} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Campos personalizados" description="Informações extras que o atendente preenche na conversa (e que entram na busca)." />
            <CardBody><FieldsPanel fields={fields} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Respostas rápidas" />
            <CardBody><QuickReplies items={quick} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Modelos aprovados" />
            <CardBody className="space-y-3 text-sm">
              {isQr ? <p>Na conexão por QR-Code não há modelos nem janela de 24 horas: escreva normalmente.</p> : <>
              <p>Só modelos aprovados pela Meta podem iniciar conversa ou responder depois de 24 horas sem mensagem do cliente. Crie e aprove os modelos no painel da Meta e sincronize aqui.</p>
              <SyncTemplates />
              {templates.map((t) => (
                <div key={t.id} className="rounded-md border border-border p-2"><div className="font-medium">{t.name} ({t.language}) <Badge tone={t.status === "APPROVED" ? "success" : "neutral"}>{t.status}</Badge></div><p className="whitespace-pre-wrap text-xs text-muted">{t.body}</p></div>
              ))}
              </>}
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}
