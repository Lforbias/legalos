> Atualização da rodada operacional: o catálogo agora contém **52 ferramentas (32 consultas e 20 propostas)**. As tabelas históricas de 35 abaixo documentam a base anterior; as 17 adições estão listadas nesta seção. Todas usam o mesmo gateway, validação, escopo e permissões na RUTE, REST e MCP.

## Ampliação operacional

| Consultas novas | Função |
|---|---|
| `listar_atividades`, `ver_detalhes_atividade` | Registros originais da agenda/gestão, checklists, participantes e série |
| `resumo_financeiro`, `buscar_lancamentos` | Posição financeira e lançamentos paginados, sem cobranças ou pagamentos |
| `produtividade_equipe` | Mesmo relatório de equipe, requer também `reports:read` |
| `buscar_documentos`, `buscar_conteudo_documentos` | Metadados e texto previamente extraído dos documentos visíveis |
| `buscar_oportunidades`, `ver_oportunidade` | Funil e detalhes do CRM |
| `listar_conversas_chat`, `ler_conversa_chat` | Busca por nome do contato/cliente vinculado (`q`), `clientId`, situação (`ALL` inclui encerradas), atribuição e paginação; leitura por direção e limite (`IN` + `limit: 1` para última mensagem do cliente), sem consumir não lidas ou enviar recibos |
| `listar_pacotes_workflow` | Etapas, perguntas, responsáveis e regras de data/dependência |

Propostas novas: `propor_checklist_tarefa`, `propor_colaborador_tarefa`, `propor_recorrencia_tarefa`, `propor_situacao_compromisso`, `propor_execucao_workflow`. As últimas três exigem confirmação reforçada. Não há ferramenta de aprovação externa. Recorrência e workflows usam os serviços do domínio; iniciar/concluir uma etapa dependente exige a conclusão da anterior.

A ampliação não representa cobertura completa de todas as escritas: pagamentos/baixas, CRM, alterações de documentos e envios de Chat continuam pelas telas. A pesquisa pública com Google é uma ação própria da tela IA; não expõe HTML de sugestões do provedor pelo catálogo MCP.

# Inventário de funcionalidades — RUTE, REST e MCP

Data: 2026-10-23. Este inventário descreve código implementado. Disponibilidade depende de permissões, configuração e credenciais. Conectores de tribunal não são considerados homologados por terem funções no código.

## Arquitetura

RUTE e MCP usam `toolList`/`callTool`. Os esquemas de entrada das propostas são gerados a partir da validação Zod do servidor. A expansão adiciona o mesmo catálogo pela REST: `GET /api/v1/tools` e `POST /api/v1/tools/{name}`. Todas as interfaces usam os serviços de negócio do LegalOS; nenhuma IA recebe acesso direto ao banco.

Antes desta expansão: 13 consultas + 7 propostas (20 ferramentas), compartilhadas por RUTE e MCP. REST de recursos: 9 operações. Primeira expansão: 17 consultas + 7 propostas (24 ferramentas). Primeira rodada operacional: 20 consultas + 15 propostas (35 ferramentas), disponíveis nos três transportes, com catálogo e contrato OpenAPI autenticados e confirmação de ações no próprio chat. Ampliação Astrea: 32 consultas + 20 propostas (52 ferramentas). A REST de recursos permanece compatível e com os mesmos 9 métodos existentes.

## Catálogo completo de ferramentas compartilhadas

| Ferramenta | Operação | Principais argumentos |
|---|---|---|
| `indicadores_escritorio` | Totais do painel, por permissão | Nenhum |
| `hoje` | Prazos próximos, tarefas atrasadas e intimações novas | Nenhum |
| `buscar_clientes` | Buscar clientes por nome/situação | q, status, limit |
| `ver_cliente` | Cliente e processos visíveis vinculados | id |
| `buscar_processos` | Buscar processos visíveis | q, status, clientId, limit |
| `ver_processo` | Processo, partes, eventos e vínculos autorizados | id |
| `andamentos_do_processo` | Consultar linha do tempo | id, limit |
| `listar_prazos` | Listar prazos por filtros | from, to, status, caseId, limit |
| `listar_tarefas` | Listar tarefas | responsavel, status, caseId, atrasadas |
| `listar_intimacoes` | Listar intimações | status, caseId, limit |
| `ver_intimacao` | Consultar o teor armazenado no LegalOS | id |
| `agenda` | Compromissos em período de até 31 dias | from, to |
| `biblioteca_do_escritorio` | Instruções e modelos ativos da IA | area, tipo |
| `ver_tarefa` **novo** | Detalhes e comentários da tarefa | id |
| `ver_prazo` **novo** | Datas, contagem, situação e responsável | id |
| `ver_compromisso` **novo** | Horário, local e vínculos autorizados | id |
| `listar_equipe` **novo** | Nomes, ids, perfis e situação, sem e-mail/credenciais | status |
| `capacidades` **novo** | Catálogo compacto do que a pessoa e a conexão podem usar | Nenhum |
| `listar_propostas` **novo** | Acompanhar pendentes/decididas | status, limit |
| `ver_proposta` **novo** | Situação e resultado de uma proposta visível | id |
| `propor_cliente` **novo** | Cadastrar cliente com dados básicos | name; type, status, tags, notes, addressCity, addressState |
| `propor_atualizacao_cliente` **novo** | Atualizar os campos informados do cliente | clientId; name, status, tags, notes, addressCity, addressState |
| `propor_atualizacao_tarefa` **novo** | Atualizar campos da tarefa sem apagar os demais | taskId; title, description, priority, dueDate, assigneeId |
| `propor_situacao_tarefa` **novo** | Iniciar, concluir, reabrir ou cancelar tarefa | taskId, status |
| `propor_comentario_tarefa` **novo** | Comentar tarefa | taskId, body |
| `propor_compromisso` **novo** | Criar compromisso no fuso do escritório | title, date; kind, allDay, startTime, endTime, location, description, caseId, clientId |
| `propor_atualizacao_compromisso` **novo** | Atualizar campos do compromisso | eventId; title, date, kind, allDay, startTime, endTime, location, description |
| `propor_cancelamento_compromisso` **novo** | Cancelar compromisso no LegalOS sem enviar comunicações externas | eventId |
| `propor_tarefa` | Propor criação de tarefa | title; description, priority, dueDate, assigneeId, caseId, clientId |
| `propor_prazo` | Propor prazo em rascunho | caseId, title, startDate, days, countType; notes |
| `propor_anotacao` | Propor nota no processo | caseId, body; title |
| `propor_minuta` | Propor documento de minuta | caseId, title, text |
| `propor_andamento` | Propor registro de andamento | caseId, text |
| `propor_peticao` | Propor petição em rascunho | caseId, title, text; kind |
| `propor_envio_para_revisao` | Propor encaminhar petição para revisão | petitionId |

Propostas não executam a alteração. Exigem decisão humana, permissões de escrita, validação dos vínculos e, conforme o tipo, confirmação reforçada. Não existe protocolo de tribunal ou envio ao cliente por essas ferramentas.

As listas atuais de ferramentas têm limites de resultado; não são exportações integrais. `indicadores_escritorio` é a fonte para totais. Paginação e cursores completos em todos os módulos são uma lacuna registrada abaixo. A REST de recursos já usa cursores nas listas que oferece.

## REST de recursos: todas as 9 operações anteriores

| Método | Caminho | Escopo |
|---|---|---|
| GET | `/api/v1/me` | Qualquer chave válida |
| GET | `/api/v1/cases` | cases:read |
| GET | `/api/v1/cases/{id}` | cases:read |
| GET | `/api/v1/clients` | clients:read |
| GET | `/api/v1/clients/{id}` | clients:read |
| GET | `/api/v1/deadlines` | deadlines:read |
| GET | `/api/v1/notices` | notices:read |
| GET | `/api/v1/notices/{id}` | notices:read |
| POST | `/api/v1/notices` | notices:write; externalId evita duplicidade |

## Expansão REST implementada nesta entrega

- `GET /api/v1/tools`: nomes, descrições, permissões e esquemas das ferramentas autorizadas.
- `POST /api/v1/tools/{name}`: argumentos como objeto JSON; resultado em `data`, com `meta.tool` e `meta.truncated`. Se o resultado ultrapassar o limite, `data` fica nulo e `meta.content` traz o texto limitado; refine a consulta.
- `GET /api/v1/openapi`: contrato OpenAPI 3.1 das rotas de recursos e operações de ferramenta autorizadas à chave.
- Escopos independentes `tools:read` e `tools:propose`, além das permissões de cada módulo. Não substituem os escopos `mcp:*` nem concedem acesso MCP.
- Chaves criadas em Integrações; gestão exige duas etapas. Ferramentas externas usam o interruptor de acesso externo da RUTE (MCP e API) e respeitam a parada de emergência. Os endpoints REST anteriores mantêm sua política própria.
- Origem `API` registrada nas consultas e propostas. Chamar uma ferramenta não exige contratar um provedor de IA; a IA externa ou aplicação escolhe se e qual modelo usar.

## MCP: métodos e capacidades atuais

Endpoint: `POST /api/mcp`. Autenticação por chave com `mcp:read`/`mcp:propose`, ou conexão OAuth conforme configuração do cliente. Catálogo filtrado por permissões e escopos.

Métodos: `initialize`, `ping`, `tools/list`, `tools/call`. `resources/list`, `resources/templates/list` e `prompts/list` retornam listas vazias atualmente. Sem streaming SSE, sessão persistente, recursos ou prompts publicados. O contrato é HTTP com respostas JSON. Compatibilidade real com cada cliente externo precisa de validação própria.

## Eventos externos (webhooks)

`notice.created`, `case.created`, `deadline.created`, `petition.submitted`, `petition.failed`; `ping` para teste. Entregas são assinadas e têm tentativas posteriores. Novos eventos de tarefas, clientes, documentos, financeiro e Chat ainda precisam ser adicionados.

## Cobertura por módulo e próximos incrementos

| Módulo | O que já está acessível | O que falta ampliar |
|---|---|---|
| Indicadores | Totais gerais por permissão | Séries por período e agregações específicas |
| Clientes | Busca/detalhe; propostas de cadastro e atualização básica | Paginação nas ferramentas, contatos/documentos e histórico mais completos |
| Processos | Busca, detalhe e andamentos | Notas completas, recursos/apensos, valores, importações e operações por proposta |
| Tarefas | Lista/detalhe; propostas de criação, edição, comentário e mudança de situação | Paginação, etapas, etiquetas, anexos e apontamentos |
| Prazos | Lista, detalhe; proposta em rascunho | Paginação completa, atualizar e acompanhar validação sem substituí-la por decisão da IA |
| Agenda | Período/detalhe; propostas de criar, editar e cancelar compromisso | Paginação e operações de participantes/recorrência |
| Equipe | Listagem e totais | Distribuição de carga, produtividade e metas; convites/alterações com controles próprios |
| Documentos | Minutas por proposta e biblioteca da IA | Metadados, texto extraído, versões, arquivos autorizados, modelos, autotextos e timbrados |
| BOX | Intimações, detalhe e registro REST | Distribuição e tratamento por proposta, notas, histórico, autos e progresso das filas |
| Petições | Proposta de rascunho e revisão | Consultar fila, status e recibos; conector real mantém validações e aprovação |
| Financeiro | Serviços/telas internos | Consultas de lançamentos, saldos, faturas, êxito e relatórios; alterações por controles específicos |
| CRM | Serviços/telas internos | Leads, propostas comerciais, contatos, conversão e relatórios |
| Chat/WhatsApp | Serviços/telas internos | Consulta autorizada de conversas/mensagens, números, filas e métricas; envios com autorização própria |
| Portal | Serviços/telas internos | Compartilhamentos, mensagens e pendências com autorização específica |
| Cálculos | Serviços/telas internos | Catálogo, critérios, cálculo salvo e exportação sem presumir adequação jurídica |
| Automações/Gestão | Serviços/telas internos | Quadros, pacotes, regras, execuções e histórico |
| Integrações | Serviços/telas internos e webhooks | Saúde e metadados de conexões, sem revelar tokens, senhas ou certificados |
| Configurações | Serviços/telas internos | Consulta de metadados e ações administrativas delimitadas; segredos não entram no catálogo geral |

## Contratos a fortalecer antes de ampliar alterações externas

1. Paginação e totais consistentes em todas as consultas; erros e limites explícitos.
2. Escopos específicos por domínio e, se necessário, por ferramenta; redução de permissões da chave sem trocar o perfil da pessoa.
3. Idempotência nas operações de escrita e criação de propostas para evitar duplicação em reenvios.
4. Esquemas completos de entrada e saída, exemplos e testes de compatibilidade do OpenAPI.
5. Eventos e processamento de trabalhos longos (autos, importações, exportações), com consulta de progresso.
6. Testes de contrato entre transportes e validação real de clientes MCP externos.
7. Rate limit compartilhado entre instâncias; retenção e auditoria das chamadas.

A meta é paridade de funcionalidades autorizadas. Ela não significa expor toda função administrativa ou segredo interno como ferramenta de IA, nem tornar aprovação, sigilo ou autorização de envio opcionais.

## Inventário das rotas HTTP internas e públicas

As rotas fora de `/api/v1` têm autenticação e finalidades próprias (sessão, portal, callbacks, cron etc.). Não são automaticamente uma API pública por chave. Não foram migradas para o catálogo externo nesta entrega.

| Rota | Métodos declarados |
|---|---|
| `/api/billing/asaas/webhook` | POST |
| `/api/calculos/[id]/export` | GET |
| `/api/cases/notes/attachments/[id]` | GET |
| `/api/certificates` | POST |
| `/api/chat/export` | GET |
| `/api/chat/library` | POST |
| `/api/clients/search` | GET |
| `/api/copiloto/audio` | POST |
| `/api/cron/autos-queue` | POST |
| `/api/cron/billing` | POST |
| `/api/cron/chat-extras` | POST |
| `/api/cron/chat-sla` | POST |
| `/api/cron/djen` | POST |
| `/api/cron/mail` | POST |
| `/api/cron/mni` | POST |
| `/api/cron/monitoring` | POST |
| `/api/cron/petition-queue` | POST |
| `/api/cron/push-due` | POST |
| `/api/cron/webhooks` | POST |
| `/api/cron/whatsapp-billing` | POST |
| `/api/documents/[id]` | GET |
| `/api/documents/[id]/versions` | POST |
| `/api/documents` | POST |
| `/api/export` | GET |
| `/api/health` | GET |
| `/api/integrations/google/callback` | GET |
| `/api/integrations/google/start` | GET |
| `/api/mcp` | POST, GET, DELETE |
| `/api/oauth/register` | POST, OPTIONS |
| `/api/oauth/token` | POST, OPTIONS |
| `/api/petitions/[id]/receipt` | GET |
| `/api/portal/documents/[id]` | GET |
| `/api/ready` | GET |
| `/api/reports/export` | GET |
| `/api/rute/lgpd` | GET |
| `/api/rute/skill` | GET |
| `/api/search` | GET |
| `/api/tasks/attachments/[id]` | GET |
| `/api/templates/preview` | GET |
| `/api/v1/cases/[id]` | GET |
| `/api/v1/cases` | GET |
| `/api/v1/clients/[id]` | GET |
| `/api/v1/clients` | GET |
| `/api/v1/deadlines` | GET |
| `/api/v1/me` | GET |
| `/api/v1/notices/[id]` | GET |
| `/api/v1/notices` | GET, POST |
| `/api/v1/openapi` | GET |
| `/api/v1/tools/[name]` | POST |
| `/api/v1/tools` | GET |
| `/api/webhooks/fees/[orgId]` | POST |
| `/api/whatsapp/conversations/[id]/file` | POST |
| `/api/whatsapp/media/[id]` | GET |
| `/api/whatsapp/webhook` | GET, POST |

## Funções de negócio exportadas por módulo

Inventário técnico de declarações `export function` dos serviços; não é uma lista de funções autorizadas pela API. Rotinas internas e administrativas não são expostas automaticamente. Tipos, constantes e funções de teste foram omitidos.

| Serviço | Funções exportadas |
|---|---|
| `agenda.service` | `listEvents`, `getEvent`, `createEvent`, `updateEvent`, `deleteEvent` |
| `ai-tools.service` | `gate`, `aiRun`, `summarizeConversation`, `stripUnverifiedCitations`, `researchJurisprudence`, `draftPiece`, `saveDraftAsDocument` |
| `ai.service` | `aiStatus`, `setOrgAiEnabled`, `buildCaseContext`, `askAboutCase` |
| `announcement.service` | `previewAnnouncement`, `sendAnnouncement`, `listAnnouncements` |
| `apikey.service` | `createApiKey`, `listApiKeys`, `revokeApiKey`, `authenticateApiKey` |
| `audit.service` | `audit` |
| `auth.service` | `appUrl`, `registerUser`, `createSession`, `login`, `startLogin`, `completeMfaLogin`, `getSessionByToken`, `logout`, `listSessions`, `revokeSession`, `revokeOtherSessions`, `setActiveOrganization`, `requestPasswordReset`, `resetPassword`, `verifyEmail`, `resendVerification`, `changePassword`, `updateProfile` |
| `autos-queue.service` | `latestAutosJob`, `enqueueAutos`, `retryAutos`, `runAutosQueue` |
| `autos.service` | `listCaseAutos`, `setDocumentBookmark` |
| `billing.service` | `billingConfig`, `saveBillingProfile`, `getBillingOverview`, `contractPlan`, `cancelSubscription`, `refreshBilling`, `handleAsaasWebhook`, `runBillingSweep` |
| `box.service` | `countNewNotices`, `getBoxDashboard` |
| `calculation.service` | `runCalculation`, `saveCalculation`, `listCalculations`, `getCalculation`, `deleteCalculation`, `exportCalculation`, `listSeriesRows`, `setCalcIndex`, `loadOfficeTables` |
| `case-extras.service` | `listCaseFees`, `addCaseFee`, `removeCaseFee`, `linkCases`, `unlinkCases`, `listCaseLinks`, `listAppeals`, `saveAppeal`, `removeAppeal`, `setValuation`, `getValuation`, `consolidatedHistory` |
| `case-import.service` | `createImportBatch`, `getImportBatch`, `listImportBatches`, `processBatchStep` |
| `case-note.service` | `listCaseNotes`, `addCaseNoteItem`, `setNotePinned`, `deleteCaseNote`, `addBulkNote`, `updateCaseNote`, `listNoteHistory`, `addNoteAttachment`, `getNoteAttachmentForDownload`, `deleteNoteAttachment` |
| `case.service` | `caseVisibility`, `assertCaseVisible`, `listCases`, `getCase`, `listCasesForClient`, `logCaseEvent`, `assertActiveMember`, `createCase`, `updateCase`, `changeCaseStatus`, `setCaseAcervo`, `archiveCase`, `addParty`, `removeParty`, `addCaseMember`, `removeCaseMember`, `listCaseOptions`, `listAssignableMembers`, `listCaseEvents`, `addCaseNote` |
| `certificate.service` | `requireMfa`, `certStatus`, `listCertificates`, `uploadCertificate`, `revokeCertificate`, `listCertificateUsage`, `listAuthorizedUsers`, `authorizeCertificateUser`, `unauthorizeCertificateUser`, `getCertificateMaterial`, `listUsableCertificates`, `assertCertificateUsable`, `runCertificateExpiryCheck` |
| `chat-automation.service` | `listAutomations`, `listAutomationRuns`, `validateRefs`, `saveAutomation`, `setAutomationActive`, `deleteAutomation`, `runChatAutomations`, `runInboundAutomations`, `runActionsOnConversation` |
| `chat-billing.service` | `getBillingSettings`, `saveBillingSettings`, `listBillingSends`, `billingHistoryForEntry`, `listOptouts`, `removeOptout`, `varsFor`, `textFor`, `billingAvailability`, `sendBillingNow`, `billingPreview`, `runBillingReminders`, `handleBillingReply`, `hadRecentBilling` |
| `chat-bot.service` | `getBot`, `saveBot`, `runBot` |
| `chat-campaigns.service` | `listCampaigns`, `campaignReport`, `createCampaign`, `approveCampaign`, `pauseCampaign`, `cancelCampaign`, `runCampaigns` |
| `chat-dialogs.service` | `listDialogs`, `saveDialog`, `setDialogActive`, `deleteDialog`, `listDialogRuns`, `runDialogs`, `runInboundDialogs`, `delegateToResponsible`, `listIntents`, `saveIntent`, `setIntentActive`, `deleteIntent`, `scoreIntent`, `testIntents` |
| `chat-extras.service` | `getExtrasSettings`, `setExtrasSettings`, `addFollowUp`, `completeFollowUp`, `listFollowUps`, `runFollowUpReminders`, `scheduleMessage`, `cancelScheduled`, `listScheduled`, `runScheduledMessages`, `askSurvey`, `autoSurveyOnClose`, `recordSurveyAnswer`, `npsReport`, `listForms`, `saveForm`, `deleteForm`, `formStatus`, `runChatExtras` |
| `chat-links.service` | `caseOptions`, `linkCase`, `createTaskFromConversation`, `createEventFromConversation`, `createDeadlineFromConversation`, `createLeadFromConversation`, `attachMessageToDocuments`, `conversationsOfClient`, `conversationsOfCase`, `conversationsOfLead` |
| `chat-meta.service` | `listLabels`, `saveLabel`, `deleteLabel`, `setConversationLabels`, `listFields`, `saveField`, `deleteField`, `cleanValue`, `setFieldValues`, `conversationMeta` |
| `chat-panel.service` | `conversationPanel` |
| `chat-queue.service` | `listQueues`, `listTeamsForQueues`, `saveQueue`, `deleteQueue`, `myAvailability`, `setMyAvailability`, `listAgents`, `pickAgent`, `autoAssign`, `distributeWaiting`, `distributePending`, `transferToQueue` |
| `chat-report.service` | `chatReport`, `computeChatReport`, `exportConversationCsv`, `exportAllCsv`, `chatReportExtra`, `getReportSchedule`, `saveReportSchedule`, `runReportSchedules` |
| `chat-send.service` | `birthdayText`, `caseText`, `caseMessageTargets`, `clientMessageTarget`, `sendToClient` |
| `chat-sla.service` | `getSla`, `saveSla`, `runSlaCheck` |
| `chat-switches.service` | `getSwitches`, `setSwitch`, `stopAllMessaging` |
| `chat-tools.service` | `createLabelPreset`, `findMentions`, `notifyMentions`, `forwardMessage`, `listLibrary`, `addLibraryFile`, `deleteLibraryFile`, `sendLibraryFile`, `listChecklists`, `saveChecklist`, `deleteChecklist`, `sendChecklist`, `listChatStatuses`, `saveChatStatus`, `deleteChatStatus`, `setChatStatus`, `runAutoArchive` |
| `chat-transcribe.service` | `transcribeMessage`, `transcriptsFor` |
| `chat-triage.service` | `createTriageRules` |
| `client-vault.service` | `listClientCredentials`, `saveClientCredential`, `deleteClientCredential`, `revealClientCredential` |
| `client.service` | `listClients`, `searchClientsForSelect`, `getClient`, `listClientTags`, `createClient`, `updateClient`, `archiveClient`, `addContact`, `updateContact`, `deleteContact` |
| `court-credential.service` | `listMyCredentials`, `listOrgCredentials`, `saveMyCredential`, `deleteCredential`, `verifyMyCredential`, `resolveMyCredential` |
| `court-system-map.service` | `listSystemMap`, `setCourtSystem`, `systemForJtr`, `assertConnectorFor`, `getReadinessReport` |
| `credit.service` | `creditBalance`, `assertCredits`, `chargeCredits`, `runCreditsCheck`, `getCreditsOverview`, `setLowThreshold`, `setOrganizationCreditsEnabled`, `grantCredits`, `platformCreditsSnapshot` |
| `crm.service` | `listLeads`, `getLead`, `createLead`, `updateLead`, `changeLeadStage`, `markLeadLost`, `reopenLead`, `addLeadActivity`, `convertLead`, `deleteLead`, `createProposal`, `updateProposal` |
| `custom-field.service` | `listCustomFields`, `createCustomField`, `setCustomFieldActive`, `setCaseCustomFields` |
| `dashboard.service` | `getDashboard`, `listAuditLogs` |
| `datajud.service` | `datajudStatus`, `setOrgDatajudEnabled`, `syncCaseFromDatajud`, `saveOrgDatajudKey`, `testOrgDatajud` |
| `db-errors` | `isUniqueViolation`, `isForeignKeyViolation` |
| `deadline.service` | `calculateAuxiliary`, `listDeadlines`, `getDeadline`, `createDeadline`, `updateDeadline`, `validateDeadline`, `fulfillDeadline`, `cancelDeadline`, `listDeadlinesForCase` |
| `developer.service` | `jobsOverview`, `recentJobRuns`, `systemOverview`, `runJobManually`, `apiOverview`, `retryDeliveryAsPlatform`, `retryMailAsPlatform`, `errorsOverview`, `testIntegration`, `switchesOverview`, `switchOffForOrganization` |
| `djen.service` | `listMonitors`, `createMonitor`, `setMonitorRecipients`, `setMonitorEnabled`, `deleteMonitor`, `syncDjen`, `runDjenAll` |
| `doc-classify.service` | `parseSuggestion`, `suggestClassification`, `suggestForUncategorized`, `listPendingClassifications`, `getPendingForDocument`, `decideClassification` |
| `document-text.service` | `extractDocumentText`, `extractPendingTexts`, `getDocumentTextInfo`, `searchDocumentContent`, `caseDocumentExcerpts` |
| `document.service` | `sanitizeFileName`, `classifyFile`, `listDocuments`, `documentVisibilityWhere`, `listRepository`, `uploadDocument`, `storeNewDocument`, `loadDocumentChecked`, `getDocument`, `updateDocumentMeta`, `addDocumentVersion`, `getDocumentForDownload`, `deleteDocument` |
| `export.service` | `exportList`, `recordExport` |
| `fee-charge.service` | `getFeeAsaasStatus`, `saveFeeAsaasConfig`, `testFeeAsaas`, `setFeeAsaasEnabled`, `createFeeCharge`, `listFeeCharges`, `cancelFeeCharge`, `handleFeeWebhook`, `createFeeContract`, `successFee`, `listFeeContracts`, `triggerFeeContract`, `cancelFeeContract` |
| `fee-invoice.service` | `listToBill`, `issueInvoice`, `cancelInvoice`, `listInvoices`, `setBoleto`, `listOpenBoletos` |
| `finance-report.service` | `annualCashflow`, `dayBalance` |
| `finance.service` | `listAccounts`, `createAccount`, `setAccountActive`, `listCategories`, `createCategory`, `setCategoryActive`, `listCostCenters`, `createCostCenter`, `setCostCenterActive`, `createEntry`, `updateEntry`, `cancelEntry`, `registerPayment`, `reversePayment`, `listEntries`, `getEntry`, `financeSummary`, `accountBalances`, `cashflow`, `entryTotalsFor` |
| `goals.service` | `setGoal`, `deleteGoal`, `goalProgress`, `weightedWorkload`, `suggestDistribution`, `applyDistribution` |
| `google-drive.service` | `getDriveSettings`, `saveDriveCredentials`, `setDriveEnabled`, `disconnectDrive`, `deleteDriveIntegration`, `makeState`, `readState`, `startDriveConnect`, `finishDriveConnect`, `driveEnabled`, `getDocumentDriveLink`, `sendDocumentToDrive`, `pullDocumentFromDrive`, `unlinkDocumentDrive` |
| `import-audit.service` | `auditImportedTasks` |
| `inbox-flow.service` | `listTeams`, `createTeam`, `setTeamMembers`, `deleteTeam`, `assignNoticeToTeam`, `returnNotice`, `sendToEntrada`, `snoozeNotice`, `normalizeTags`, `setNoticeTags`, `listNoticeTags`, `addNoticeNote`, `deleteNoticeNote` |
| `insights.service` | `getIndicators`, `birthdayRows`, `alertCounts`, `alertItems` |
| `invitation.service` | `invitationLink`, `createInvitation`, `listInvitations`, `revokeInvitation`, `previewInvitation`, `acceptInvitation` |
| `kanban.service` | `listBoards`, `createBoard`, `renameBoard`, `archiveBoard`, `getBoard`, `addColumn`, `renameColumn`, `shiftColumn`, `deleteColumn`, `createCard`, `updateCard`, `moveCard`, `deleteCard`, `listCardEvents` |
| `letterhead.service` | `listLetterheads`, `createLetterhead`, `updateLetterhead`, `deleteLetterhead`, `getLogo`, `resolveLetterhead` |
| `linked-document.service` | `parseHttpsUrl`, `listLinkedDocuments`, `listLinkedModels`, `addLinkedDocument`, `removeLinkedDocument` |
| `mail-outbox.service` | `enqueueMail`, `runMailOutbox`, `mailQueueStats` |
| `mcp-auth.service` | `parseScopes`, `validRedirectUri`, `registerClient`, `getClient`, `createAuthCode`, `exchangeCode`, `refreshTokens`, `authenticateMcpBearer`, `listMcpConnections`, `revokeMcpConnection` |
| `members` | `listActiveMembers`, `userNames` |
| `membership.service` | `listMembers`, `changeMemberRole`, `setMemberStatus`, `removeMember` |
| `mfa.service` | `mfaStatus`, `startEnrollment`, `confirmEnrollment`, `verifySecondFactor`, `disableMfa`, `regenerateRecoveryCodes` |
| `mni-petition.service` | `setPetitionTypes` |
| `mni.service` | `listConnections`, `createConnection`, `setConnectionEnabled`, `deleteConnection`, `loadConnection`, `mtlsFor`, `record`, `syncAvisos`, `connectionForCase`, `consultCaseMni`, `importAutosMni`, `runMniAll`, `inspectConnectionContract`, `assertConnectionOperation` |
| `monetary-index.service` | `parseBcbSeries`, `syncOfficialIndexes`, `setManualIndex`, `correctValue`, `indexCoverage` |
| `monitoring.service` | `classifySource`, `getMonitoringOverview`, `runMonitoringCheck` |
| `notice-activity.service` | `getNoticeActivity` |
| `notice-bulk.service` | `bulkUpdateNotices` |
| `notice-desk.service` | `noticeDayCounts`, `monitorProblems`, `suggestAvailability`, `suggestForNotice` |
| `notice-guard` | `assertNoticeUsable` |
| `notice-triage.service` | `presumedAwareness`, `triageNotice`, `getTriage`, `updateTriageMinuta`, `validateTriage`, `discardTriage`, `triageAvailability` |
| `notice.service` | `visibility`, `analyzeText`, `listNotices`, `noticeCounts`, `noticeBoxCounts`, `getNotice`, `createNotice`, `assertNoticeRecipients`, `assignNotice`, `linkNoticeCase`, `markProcessed`, `discardNotice`, `reopenNotice`, `deleteNotice`, `resolveSourceNotice` |
| `notification.service` | `notify`, `listNotifications`, `unreadCount`, `markRead`, `markAllRead`, `syncDueNotifications` |
| `office-ai-provider.service` | `officeToolProvider`, `officeAiProvider` |
| `org-security.service` | `hasModule`, `assertModule`, `modulesOf`, `getSecuritySettings`, `saveSecuritySettings`, `checkOrgAccess`, `listOrgSessions`, `revokeOrgSession` |
| `organization.service` | `createOrganization`, `listUserOrganizations`, `getOrganization`, `updateOrganization`, `setRequireMfa`, `mfaCoverage` |
| `party-registry.service` | `listRegistry`, `searchRegistry`, `createRegistryParty`, `updateRegistryParty`, `deleteRegistryParty`, `casesOfRegistryParty` |
| `petition-queue.service` | `getScheduleSwitch`, `setScheduleSwitch`, `schedulePetition`, `unschedulePetition`, `listQueue`, `getReceipt`, `runDueSchedules` |
| `petition.service` | `listPetitions`, `getPetition`, `addAttachment`, `removeAttachment`, `setAttachmentClassification`, `moveAttachment`, `createPetition`, `updatePetition`, `requestReview`, `approvePetition`, `returnPetition`, `cancelPetition`, `submitPetition` |
| `plan.service` | `resolveEntitlements`, `getEntitlements`, `getUsage`, `assertExpansionAllowed`, `assertStorageAvailable`, `effectiveAiLimit`, `assertAiAllowed` |
| `platform.service` | `resolvePlatformContext`, `platformAccessState`, `assertPlatform`, `platformOverview`, `listOrganizations`, `setOrganizationSuspended`, `listPlatformUsers`, `setUserDisabled`, `unlockUser`, `listPlatformAudit`, `integrationsHealth`, `listPlans`, `updatePlan`, `setOrganizationSubscription` |
| `portal-plus.service` | `draftPortalUpdate`, `approvePortalUpdate`, `discardPortalUpdate`, `listPortalUpdatesForCase`, `createClientPending`, `listPendingsForClient`, `setPendingStatus`, `listPortalInbox`, `listMessagesForClient`, `replyToClient`, `approvedUpdatesForPortalCase`, `listMyPendings`, `markMyPendingDone`, `listMyMessages`, `sendMyMessage` |
| `portal.service` | `inviteClientToPortal`, `listPortalAccess`, `revokePortalAccess`, `revokePortalInvitation`, `setCaseSharing`, `setDocumentSharing`, `hasPortalAccess`, `listPortalCases`, `getPortalCase`, `listPortalDocuments`, `getPortalDocumentForDownload` |
| `public-api.service` | `parseLimit`, `apiListCases`, `apiGetCase`, `apiListClients`, `apiGetClient`, `apiListDeadlines`, `apiListNotices`, `apiGetNotice`, `apiCreateNotice` |
| `push.service` | `pushConfigured`, `vapidPublicKey`, `setup`, `sendToSub`, `getPushView`, `saveOrgPush`, `savePrefs`, `subscribe`, `unsubscribe`, `sendTest`, `runPushDue` |
| `report.service` | `availableReports`, `resolvePeriod`, `deadlinesReport`, `noticesReport`, `casesReport`, `teamReport`, `financeReport`, `exportReport` |
| `role.service` | `listRoles`, `createRole`, `updateRole`, `deleteRole`, `listRoleTemplates`, `createRoleFromTemplate`, `accessReview` |
| `rute-assistant.service` | `assistantAvailability`, `purgeExpired`, `listConversations`, `getConversation`, `createConversation`, `deleteConversation`, `sendMessage` |
| `rute-governance.service` | `usageReport`, `listToolHistory`, `lgpdReport`, `lgpdCsv` |
| `rute-library.service` | `listInstructions`, `saveInstruction`, `deleteInstruction`, `buildSkillPackage` |
| `rute-operations.service` | `prepareOperation`, `executeOperation` |
| `rute-proposal.service` | `createProposal`, `listProposals`, `getProposal`, `updateProposal`, `approveProposal`, `rejectProposal`, `pendingProposalCount` |
| `rute-settings.service` | `getRuteSettings`, `assertRuteOn`, `setRuteFeature`, `setEmergencyStop`, `setAssistantProvider`, `officeProviderKey`, `setGovernance` |
| `rute-tools.service` | `toolList`, `toolCatalog`, `callTool` |
| `service-session.service` | `parseAnalysis`, `createSession`, `analyzeSession`, `listSessions`, `getSession`, `approveSession`, `deleteSession`, `transcribeAudio`, `copilotAvailability` |
| `snippet.service` | `listSnippets`, `getSnippet`, `createSnippet`, `updateSnippet`, `deleteSnippet`, `activeSnippetMap` |
| `task-event` | `recordTaskEvent` |
| `task-extras.service` | `listTaskTypes`, `saveTaskType`, `deleteTaskType`, `listTaskLabels`, `saveTaskLabel`, `deleteTaskLabel`, `getTaskClassification`, `setTaskClassification`, `listTaskEvents`, `listTaskAttachments`, `addTaskAttachment`, `getTaskAttachmentForDownload`, `deleteTaskAttachment`, `pointsReport` |
| `task-stage.service` | `listTaskStages`, `saveTaskStage`, `setTaskStage` |
| `task.service` | `taskVisibility`, `listTasks`, `getTask`, `createTask`, `updateTask`, `changeTaskStatus`, `deleteTask`, `addTaskComment`, `listTasksForCase` |
| `team.service` | `logTime`, `deleteTime`, `listMyTime`, `teamWorkload` |
| `template.service` | `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `generateFromTemplate`, `previewTemplatePdf` |
| `tenant.service` | `resolveTenantContext` |
| `tool-api.service` | `apiToolScopes`, `apiToolCatalog` |
| `webhook.service` | `createWebhook`, `listWebhooks`, `recentDeliveries`, `setWebhookEnabled`, `deleteWebhook`, `retryDelivery`, `emitWebhookEvent`, `testWebhook`, `runWebhookDeliveries` |
| `whatsapp-account.service` | `whatsappKeyAvailable`, `webhookConfigured`, `getAccount`, `connectAccount`, `setAccountEnabled`, `removeAccount`, `updateSettings`, `listQuickReplies`, `saveQuickReply`, `deleteQuickReply`, `listTemplatesLocal`, `syncTemplates`, `canManage` |
| `whatsapp-auth` | `requireCertKey`, `loadAuth` |
| `whatsapp-ingest.service` | `ingestMessage`, `applyStatusUpdate` |
| `whatsapp-numbers.service` | `listNumbers`, `addMetaNumber`, `addQrNumber`, `setNumberEnabled`, `renameNumber`, `removeNumber`, `numberQrStatus`, `restartNumberQr` |
| `whatsapp-qr.service` | `startQrSession`, `stopQrSession`, `resumeQrSessions`, `connectQr`, `getQrStatus`, `disconnectQr`, `restartQr` |
| `whatsapp-transport` | `getTransport` |
| `whatsapp-webhook.service` | `verifyChallenge`, `handleWebhook` |
| `whatsapp.service` | `listConversations`, `unreadTotal`, `openConversation`, `sendMessage`, `sendFile`, `sendTemplateMessage`, `addNote`, `assignConversation`, `setConversationStatus`, `linkClient`, `searchClientsForLink`, `startConversation`, `getMessageMedia`, `teamForAssignment`, `windowAllowsText`, `systemSendText`, `systemSendTemplate` |
| `workflow-package.service` | `ensureSeedPackages`, `listPackages`, `savePackage`, `deletePackage`, `runPackage`, `listRunsForCase` |
| `workflow.service` | `runWorkflows`, `listRules`, `getRule`, `createRule`, `updateRule`, `setRuleActive`, `deleteRule`, `listRecentRuns` |

## Descoberta e autorização MCP

Além das rotas `/api`, há `GET /.well-known/oauth-authorization-server`, `GET /.well-known/oauth-protected-resource` e `GET /.well-known/oauth-protected-resource/api/mcp`. O consentimento ocorre na página `/oauth/authorize`; registro e emissão/troca de tokens usam `POST /api/oauth/register` e `POST /api/oauth/token`. Esses endpoints implementam o fluxo de autorização, não ferramentas de negócio.

## Rodada operacional: execução dentro da conversa

- A mensagem da RUTE mostra o cartão da proposta, os dados e os controles de revisão/aprovação/recusa. O resultado pode ser aberto sem procurar a proposta em outra tela.
- A criação/alteração real só ocorre depois da aprovação humana. As ferramentas de consulta permitem acompanhar o resultado por MCP ou REST; não há ferramenta de aprovação autônoma.
- Atualizações guardam a versão do registro de destino e recusam a execução quando ele mudou depois da proposta. É necessário consultar os dados atuais e criar outra proposta.
- Edições de propostas não podem trocar ids de destino nem a versão registrada. As permissões e visibilidade são verificadas de novo pelos serviços na execução.
- As propostas de cada resposta são vinculadas à conversa correspondente, evitando misturar ações de conversas simultâneas da mesma pessoa.
- O cadastro de clientes nesta rodada usa dados básicos; não inclui os campos de documento, e-mail e telefone. Uma atualização básica preserva esses campos já cadastrados.
