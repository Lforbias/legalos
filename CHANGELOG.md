## LegalOS Desktop — identidade e produto (2026-10-26)

- Marca vetorial própria em preto e branco, com versões para os temas claro e escuro, aplicada ao cabeçalho do Desktop.
- Destaque em `/produto`, navegação pública e recursos; apresentação dedicada em `/produto/desktop`, com dados fictícios e indicação de uso em computador.
- Documentadas as funções disponíveis e as ideias futuras de voz, organização automática e conexão a notebooks. A animação de entrada atual foi mantida.

## DataJud — chave por escritório (2026-10-23)

Migração aditiva: `20261220000000_datajud_org`.

- Campo de chave pública do DataJud em Integrações, guardada com AES-GCM e incluída na rotação de MFA_ENCRYPTION_KEY. Não volta ao navegador nem aparece em auditoria.
- Cada escritório usa sua configuração; a variável DATAJUD_API_KEY permanece como alternativa do servidor. Ligar/desligar é independente de guardar a chave.
- Teste de autenticação sem consultar dados de processos (size 0 / match_none). Consulta de andamentos continua respeitando o sigilo e evitando duplicatas.

## BOX — leitura, autos e operação (2026-10-23)

Migração aditiva: `20261219000000_box_operation`. Não altera status de tarefas existentes nem ativa integrações.

- Leitura integrada da caixa: lista à esquerda, teor e providências ao centro, notas/contexto à direita. Filtros e paginação preservados; controles existentes reutilizados.
- Autos digitais por processo: índice paginado, busca por nome/descrição/texto extraído (inclusive versões anteriores), favoritos pessoais, download, prévia autenticada de PDF/PNG/JPEG e evidência da última sincronização MNI. Outros formatos continuam como anexo. Prévia aplica as mesmas permissões e sigilo do download.
- Automações com até 10 condições combinadas por E/OU, comparações sem distinção de acento/caixa e ações opcionais de distribuição individual/etiquetas para intimações. Distribuição, etiquetas e tarefa ficam na mesma transação; destinatários passam pela conferência de sigilo. Execuções ignoradas/falhas seguem registradas.
- Etapas de tarefas personalizáveis (ex.: Aguardando protocolo), ordenação e desativação. Status-base fixo preserva a semântica de conclusão e os indicadores. Troca de etapa registra histórico; seleção de status padrão limpa a etapa.
- Box → Operação e auditoria reúne saúde das fontes, separação de histórico/captura, situação real dos conectores e diagnóstico somente leitura da migração do Astrea.
- Homologação externa pendente: usuário ainda não dispõe de OAB/credenciais/ambiente de teste. MNI continua sem validação real; eproc/e-SAJ/PROJUDI continuam sem conector. Nenhum protocolo real foi enviado.

# Changelog

## Box — filtros, paginação e ações em lote

- Compatibilidade do build: wrapper da API v1 passa a exigir o contexto de rota fornecido pelo Next.js; testes diretos passam contexto explícito.

- Caixa com paginação (25/50/100), ordenação e filtros por tipo, origem, tribunal/órgão, recebimento e publicação. Intervalos inclusivos e validados; filtros preservados na paginação e troca de caixa.
- Distribuição para pessoa/equipe, adição de etiquetas sem remover as anteriores, adormecimento e tratamento de até 100 intimações selecionadas. Revisão antes da confirmação, transação atômica, auditoria por item, notificações e proteção contra versões antigas/concorrência.
- Destinatários precisam ser ativos, ter acesso à caixa e enxergar todos os processos do lote.
- Corrigida a consulta de etiquetas para respeitar sigilo; coluna de origem distingue DJEN/PJe de outras importações.

## Box — leitura e origem das intimações

- O teor das publicações exibe quebras e destaques como texto legível, sem executar HTML nem modificar o original no banco.
- Box e Monitoramento distinguem capturas identificadas do DJEN/PJe das demais importações (incluindo histórico e API) e registros manuais/arquivo. Gráficos e totais usam o mesmo período no fuso do escritório, por data de entrada no LegalOS.
- Removido o corte silencioso de 20 mil registros no gráfico do Box; contagens respeitam sigilo e escritório.
- Novo `npm run audit:astrea-tasks -- --org <id>`: diagnóstico somente leitura de tarefas importadas ainda abertas cujo comentário registra conclusão antiga. São indícios para conferência com o CSV e histórico de reabertura, nunca correções automáticas.

## Infra — publicação automática
GitHub Actions (`.github/workflows/deploy.yml`) + `scripts/server/deploy.sh` e `deploy-entry.sh`: só publica o que passou no CI; chave de deploy presa a um único comando; backup antes, migração, conferência de `/api/ready` e volta automática do código. Passo a passo em `docs/deploy-github.md`. Ainda não testada no servidor real.

## 6.0.0
RUTE, a IA do LegalOS. Migração nova: `20261218000000_rute_6_0` (10 tabelas). Sem rotina nova no agendador (retenção roda de forma preguiçosa).

- F1 `/api/mcp` (MCP sobre HTTP, só JSON): ferramentas de leitura (hoje, clientes, processos, andamentos, prazos, tarefas, intimações, agenda, biblioteca) e de proposta; sempre como a pessoa que conectou; CPF/CNPJ/e-mail ocultados; resultado marcado como dado, não instrução.
- F2 conexão: OAuth 2.1 (cadastro dinâmico, código + PKCE S256, token de 1 h, renovação de 30 dias com rotação, metadados RFC 8414/9728, tela `/oauth/authorize` com consentimento e 2FA) e chave `lgos_` com escopos `mcp:read`/`mcp:propose`; passo a passo, testar conexão, revogar.
- F3/F9 propostas (`aiProposal`): tarefa, prazo (rascunho), anotação, minuta, andamento, petição (rascunho) e envio para revisão; aprovação humana com edição; ações de maior risco exigem confirmação reforçada; nunca protocola.
- F4 aba `/rute` (situação, conexões, propostas, assistente, biblioteca, histórico, governança). F5 assistente com adaptadores Claude/Gemini/OpenAI (chamada de ferramentas). F6 botão RUTE em processo e cliente. F7 biblioteca + pacote .zip de skill. F8 limites, uso, retenção, parada de emergência e relatório de LGPD (CSV).
- Limites conhecidos: Claude, ChatGPT e Gemini só conferidos contra a documentação oficial e simuladores (cada um tem regras de plano/administrador próprias); adaptadores de provedor testados contra servidores falsos; sem streaming/SSE (só resposta JSON); o relatório de uso é em tokens (sem conversão em reais); a retenção apaga de forma preguiçosa ao abrir a aba ou conversar.

## 5.0.0
Calculadoras, portal em linguagem simples, cobrança Pix/boleto, triagem com minuta, copiloto e metas. Migração nova: `20261217000000_calc_5_0` (10 tabelas). Sem rotina nova no agendador.

- F1 `/calculos`: atrasados JF (INPC + SELIC), TJSP (tabela/SELIC/híbrido), atualização trabalhista (TR → IPCA-E → SELIC) e rescisão, prazos; salvo no processo; CSV, Excel e memorial; índices do escritório em `/calculos/indices` (lançar, carregar tabela TJSP e reajuste INSS, sincronizar BCB). Sem índice, o cálculo para e diz o que falta.
- F2 portal: andamento em linguagem simples com aprovação humana, pendências do cliente e mensagens (`/portal-equipe`).
- F3 `/financeiro/cobranca` e `/financeiro/exito`: cobrança Pix/boleto no Asaas do escritório, aviso em `/api/webhooks/fees/<escritório>` (token próprio), baixa automática idempotente, contratos de êxito.
- F4 triagem na página da intimação: regras ou IA, ciência presumida (art. 224, §2º CPC), minuta em rascunho, validar (opcional: criar prazo em rascunho).
- F5 `/copiloto`: transcrição (texto ou áudio via Gemini) → resumo, ações, tarefas e documentos em rascunho; tarefas só após revisão.
- F6 `/equipe/metas`: metas mensais, progresso, carga por peso e distribuição sugerida (confirmada por pessoa).
- Limites conhecidos: Asaas e Gemini só testados contra simuladores (use o sandbox do Asaas primeiro); calculadoras são apoio, não substituem CálcJF/PJe-Calc; reajuste do INSS de 2026, IPCA-E, TR e salário mínimo precisam ser lançados pelo escritório; a regra de mês inicial da SELIC está descrita no memorial de cada cálculo; células do Excel saem como texto; a triagem por regras só reconhece os atos da tabela; nenhuma mensagem sai para o cliente sem pessoa.

## 4.0.0
Chat no nível do ChatGuru. Migração nova: `20261216000000_chat_4_0`. Sem rotina nova: tudo roda dentro de `chat-extras` (a cada minuto).

- F1/F2/F4 etiquetas prontas, menção a colega, encaminhar a até 10 chats, biblioteca de arquivos, checklists enviáveis, status de chat e encerramento automático por inatividade (só encerra; não escreve ao cliente).
- F5/F9 diálogos do robô (tempo sem resposta, aniversário, audiência/perícia da Agenda ligada ao cliente, horário), entrega ao advogado responsável e intenções por pontuação de palavras. Tudo desligado por padrão; opt-out respeitado; fora da janela só modelo aprovado.
- F6 relatórios por status, chats adicionados, tempo por usuário e acessos; resumo por e-mail (só números; exige SMTP).
- F7 campanhas: rascunho → aprovação humana → envio gradual (20 por minuto), máx. 500, modelo obrigatório na Meta, relatório por destinatário.
- F8 pesquisa de satisfação opcional ao encerrar. F9 transcrição de áudio via Gemini (2 créditos; `GEMINI_API_KEY`).
- F10 IP permitido (CIDR; trava anti-bloqueio), saída por inatividade (mín. 10 min), sessões da equipe e módulos por plano (`mod:campanhas`, `mod:ia`, `mod:cofre` em `Plan.features`; plano sem `mod:` libera tudo).
- Limites conhecidos: Gemini só testado contra simulador; status das campanhas só muda no envio (não pelo recibo de leitura); a lista de conversas ainda não mostra o status de chat (só dentro da conversa); relatórios por dia em UTC; F11 depende de telas do ChatGuru ainda não vistas.

## 2.0.0
Fechamento da 2.0. Migrações novas: `20261208000000_f3_kanban`, `20261209000000_f4_financeiro`, `20261210000000_f5_processo`, `20261211000000_f7_documentos_link`, `20261212000000_f8_varios_numeros`, `20261213000000_f9_chat_extras`, `20261214000000_f10_ia`, `20261215000000_f11_cofre`.

- F3 Kanban de gestão e pacotes de tarefas; F4 fluxo anual, faturas e boleto; F5 honorário, apensos, recursos, provisão e correção por índices oficiais (BCB, sincronização a confirmar no servidor); F7 documentos do Astrea como link.
- F8 até 5 números por escritório (cada conversa responde pelo número que a recebeu). F9 retornos combinados, mensagens agendadas e NPS (desligados por padrão), formulários, relatórios e exportação CSV auditada; nova rotina `chat-extras` (rodar `install-cron.sh`).
- F10 IA com chave real: resumo de conversa (chave própria), mapa de pesquisa de jurisprudência (números de processo removidos) e minuta de peça com aviso. F11 cofre de senhas de clientes (2FA a cada abertura, auditado), modelos de perfil com mínimo de acesso e revisão de acessos.
- Correção: `rotate-keys` agora também re-cifra credenciais de tribunais (3.0) e o cofre de clientes.

## 3.0.0 (em construção)
Ver `docs/roadmap-3.0.0.md` (comparação com o LegalMail).

- **3.0-F1 Partes únicas, campos personalizados, acervo e notas** (migração `20261126000000_legalmail_f1`: `party_registry`, `custom_field_defs`, `case_notes`, `cases.archived_at`, `cases.custom_fields`, `case_parties.registry_id`): cadastro único de partes reaproveitável (`/partes`, busca, edição propaga o nome, exclusão lógica); campos personalizados de processo (Configurações → Campos personalizados; texto, número, data e lista; só administradores definem; desativar preserva valores); acervo (mover/devolver, filtro na lista, registro na linha do tempo); aba Notas com fixar no topo e nota em lote (até 50 processos, tudo ou nada, respeita sigilo e isolamento). Fica para a 3.0-F2: anexos e histórico de alterações das notas.

- **3.0-F3 Timbrados e prévia em PDF** (migração `20261127000000_legalmail_f3`: `letterheads`): timbrado do escritório (cabeçalho, rodapé, logo PNG/JPEG até 300 KB, numeração; um padrão por escritório) aplicado ao .docx gerado de modelos; prévia em PDF (`/api/templates/preview`, não grava nada; biblioteca `pdf-lib`); variáveis novas `processo.polo_ativo`, `processo.polo_passivo`, `processo.responsavel`, `processo.data_distribuicao`, `processo.numero_antigo`, `escritorio.documento`. Fora: prévia de .docx já anexado (precisaria de conversor no servidor).

- **3.0-F4 Importação de processos em lote** (migração `20261128000000_legalmail_f4`: `case_import_batches`, `case_import_items`): `/processos/importar` cadastra até 200 números CNJ por vez (validação do dígito, repetidos, existentes, cliente opcional como parte); DataJud e autos pelo MNI em passos curtos e retomáveis, por item; histórico das importações.

- **3.0-F2 Tarefas 2.0** (migração `20261129000000_legalmail_f2`: `task_types`, `task_labels`, `task_label_links`, `task_events`, `task_attachments`, `tasks.type_id`, `task_comments.mentioned_ids`): tipos de tarefa com pontuação e etiquetas (Configurações → Tarefas; só `organization:manage` cria), cartão Tipo e etiquetas na tarefa, filtros por etiqueta e tipo, relatório *Pontuação do mês* por responsável, menções `@Nome Completo` em comentários com aviso `task.mention`, anexos (mesma lista de tipos e limite de 8 MB dos documentos, download autenticado em `/api/tasks/attachments/[id]`, respeita sigilo) e histórico de alterações. Fora: anexos/histórico das notas de processo.

- **3.0-F5/F9/F10/F6b/notas/F3b/F8/F7/F6** (migrações `20261130000000_legalmail_f5`, `20261201000000_legalmail_f9`, `20261202000000_legalmail_f10`, `20261203000000_legalmail_f6b`, `20261204000000_legalmail_notes`, `20261205000000_legalmail_f3b`, `20261206000000_legalmail_f8`, `20261207000000_legalmail_f6`): fila de protocolos com recibo e agendamento; usuários autorizados no certificado e webhooks `petition.submitted`/`petition.failed`; créditos por escritório (protocolo real = 5, FIFO por validade, avisos); credenciais por tribunal e usuário (cifradas); notas com edição, anexos e histórico; Google Drive/Docs opcional com credenciais de cada escritório; classificação de documentos por IA com decisão humana; painel `/monitoramento` + rotina `monitoring` (reinstalar `install-cron.sh`); mapa de sistema por tribunal e registro de conectores (só PJe/MNI tem conector; os demais recusam com aviso). Tudo testado só contra simuladores; F11 depende das telas do LegalMail.

## 6.0.0 (RUTE, planejada)
Ver `docs/roadmap-6.0.0.md` (servidor MCP + aba Inteligência Artificial). Só plano; nada implementado. A F10 da 2.0 é entregue por esta versão.

## 5.0.0 (ideias de futuro)
Ver `docs/roadmap-5.0.0.md`. Só plano; nada implementado.

## 4.0.0 (planejada)
Ver `docs/roadmap-4.0.0.md` (comparação com o ChatGuru). Só plano; nada implementado.

## 2.0.0 (em construção)
Ver `docs/roadmap-2.0.0.md`. As fases concluídas são listadas aqui conforme forem entregues.

- **F6 Pequenos itens** (migração `20261125000000_pequenos_itens`: `organizations.require_mfa`): aba *Aniversariantes* na Central de alertas (pessoa física ativa, hoje e 7 dias; fora do total "pedindo atenção"), com envio de parabéns por WhatsApp revisado por uma pessoa; *2FA obrigatório por escritório* (Configurações → Segurança; dono precisa do próprio 2FA; quem não ativou cai em `/exigir-2fa`, sem acesso a telas e API até ativar; desligar 2FA bloqueado enquanto exigido; só perfis internos, não o cliente do portal); *exportação geral* `.xlsx`/CSV (`/api/export`, 10/min, até 5.000 linhas, respeita permissões e confidenciais) em clientes, processos, tarefas, lançamentos e relatórios; botão *Enviar por WhatsApp* no processo e no cliente (texto editável, janela de 24 h da Meta respeitada, texto fora da auditoria). Equipes e botão de cobrança no financeiro já existiam.
- **F15 Comunicados do developer** (migração `20261124000000_comunicados`: `announcements` + `push_preferences.announcements`): aba Comunicados no painel do developer; novidade/manutenção/alerta no sino e/ou no celular para todos, um escritório ou uma pessoa; conferência do número de destinatários antes de enviar; 5 por hora; sem repetição em 10 min; quem desligou comunicados não recebe push; texto fora da auditoria. Sem agendamento (próxima versão).

- **F14 Avisos no celular (push)** (migração `20261123000000_push`: `push_settings`, `push_subscriptions`, `push_preferences`, `push_deliveries`): ativação por aparelho em Minha conta (até 5), antecedência 0–3 dias, prazos e/ou tarefas, botão de teste, interruptor por escritório (nasce desligado), texto genérico sem dados de clientes, janela 7h–20h, rotina `push-due` a cada 15 min, service worker com `push` e `notificationclick`, endereços de push restritos a Google/Mozilla/Apple/Windows. Requer chaves VAPID (docs/push.md). Site /produto atualizado.

- **F2 Indicadores e central de alertas** (`/indicadores`, `/alertas`; sem migração, tudo calculado na hora): *Indicadores* — atrasados por tipo (tarefas, prazos, publicações novas há mais de 2 dias, honorários a receber e contas a pagar vencidos com saldo), movimentação dos processos ativos em 7/30/60/90 dias, evolução da carteira (processos e clientes cadastrados por mês, total acumulado, situação), 10 clientes com mais processos ativos e os números pessoais (tarefas, prazos, publicações, processos). *Central de alertas* — abas Publicações, Andamentos (7 dias), Processos (ativos sem movimento há mais de 60 dias), Tarefas, Prazos, Agenda (hoje a +2 dias), Financeiro (vencidos e a vencer em 3 dias) e Integrações (DJEN com erro ou parado, certificados vencendo, WhatsApp com problema), cada uma com contador e link direto. Cada bloco só aparece com a permissão de leitura do módulo; processos confidenciais seguem a regra de sempre. Aba do Portal não entrou: o portal ainda não gera eventos de alerta.
- **Chat — SLA de resposta e triagem por área** (etapa 1 da migração do fluxo n8n/ChatGuru; ver `docs/migracao-n8n-chatguru.md`): (1) *SLA de resposta* em Configurações do Chat — se o cliente escreveu e nenhuma pessoa respondeu em X minutos (padrão 15, a qualquer hora), o responsável da conversa e, se escolhido, uma pessoa de escalonamento recebem aviso interno e e-mail; nasce **desligado**, nunca escreve ao cliente, um alerta por mensagem do cliente, respondeu → some sozinho, sem alertar conversas com mais de 24 h nem as que ainda estão no menu automático sem responsável; ligar/desligar/alterar fica na auditoria. Rotina `chat-sla` a cada 5 min (`/api/cron/chat-sla`; `install-cron.sh` atualizado; aparece no painel developer com "Rodar agora"). (2) *Triagem por área (modelo)* — cria, desligadas, regras de palavras-chave (previdenciário, trabalhista, cível) que mandam a conversa para a fila e/ou o atendente escolhidos; "Outros" cai na fila padrão. Sem IA. Migração `20261122000000_chat_sla`.
- **F1 Publicações:** contadores do dia (não tratadas de hoje/todas, tratadas e descartadas hoje); aviso na Caixa de entrada quando um nome monitorado falhou, nunca foi verificado ou está há mais de 36 h parado; cada monitoramento do DJEN pode enviar as publicações novas direto a um membro ou a uma equipe (padrão: Entrada); botão "Sugerir providência com IA" que só sugere (nada é criado), mascara CPF/CNPJ, exige IA ligada no escritório e chave do provedor, e abre tarefa ou prazo (rascunho) já preenchidos para a pessoa conferir. Migração `20261120000000_publicacoes_destinatario`.
- **F13 Painel do developer** (`/admin/developer`, só o dono da plataforma com 2FA; os demais recebem 404): (1) *Saúde e rotinas* — estado do sistema e, para as 6 rotinas do agendador, última execução, duração, erros e atraso, com histórico e botão "Rodar agora" para webhooks, e-mail, DJEN e MNI (cobrança não tem botão); (2) *API, chaves e webhooks* — contagens de chaves (sem exibir chave nem prefixo), webhooks instáveis/desligados (só o servidor, nunca o caminho da URL), entregas e e-mails com falha com "Reenviar"; (3) *Auditoria e erros* — erros inesperados agrupados (mensagem mascarada, sem pilha, com a referência que o usuário vê), acessos negados/falhas e ações do administrador; (4) *Integrações e interruptores* — testa banco, arquivos, SMTP (só conecta, não envia), Asaas, DataJud e DJEN, e mostra o que está ligado em cada escritório com parada de emergência que só desliga. Tudo auditado; nada mostra conteúdo dos escritórios. Quinta aba *Novidades e andamento*: o que já foi entregue, as fases que faltam da 2.0.0 e da 3.0.0 e as pendências da equipe (dados em `src/lib/updates.ts`, a atualizar a cada entrega). Migração `20261121000000_painel_developer` (`job_runs`, `app_errors`); as 6 rotinas e as ações passam a registrar execuções e erros.
- **Extra — Site público do produto** (`/produto`, `/produto/recursos`, `/seguranca`, `/sobre`, `/contato`): mini-site de apresentação com hero escuro, telas reais com dados fictícios (gerados por `scripts/demo-seed.ts` + `scripts/demo-shots.mjs`, que só rodam em banco `_demo`), vitrine de módulos, linha do tempo do que já foi entregue e o que vem a seguir. Só fatos verificados; contato por `PUBLIC_CONTACT_WHATSAPP` / `PUBLIC_CONTACT_EMAIL`.

## 1.x
Núcleo (clientes, processos, tarefas, prazos, agenda, financeiro com Asaas, CRM, documentos e petições, DataJud/MNI/DJEN, OCR, relatórios, portal, API e webhooks, 2FA, PWA) e LegalOS Chat (WhatsApp Meta e QR, filas, etiquetas, bot, automações, cobrança, painel lateral, interruptores, novo visual).
