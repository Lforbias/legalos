# Evolução do LegalOS Chat — 26/10/2026

Fonte de escopo: planilha `Funcionalidades_plataformas_atendimento_WhatsApp_com_LegalOS.xlsx`, fornecida pelo usuário. Após a leitura, o usuário priorizou **WhatsApp e e-mail**, retirando os demais canais desta rodada. Este documento distingue código entregue de operação homologada.

## O que foi implementado nesta rodada

| Recurso | Entrega e limite |
|---|---|
| Copiloto no WhatsApp | Sugestão de resposta, reescrita no tom do escritório e tradução. O resultado é mostrado para revisão e só entra no compositor quando a pessoa escolhe. Enviar continua sendo uma ação separada. |
| Classificação por IA | Sugere sentimento, prioridade operacional, fila, etiquetas e motivo de encerramento. Confirmação aplica fila, etiquetas e nota; não encerra nem envia automaticamente. Prioridade não calcula prazo judicial. |
| Conhecimento do escritório | Base específica do Chat, gerenciada em `/atendimento/operacoes`. Apenas os artigos cadastrados nessa base entram nas sugestões, com mascaramento de identificadores. Até 20 artigos por geração; não é busca semântica nem treinamento de modelo. |
| Atendimento simultâneo | Presença e aviso de colega escrevendo, sem transmitir o texto do rascunho. Atualiza aproximadamente a cada 12 segundos, expira após 40 segundos. É um aviso colaborativo, não uma trava exclusiva. |
| Macros | Nota, etiquetas adicionais, fila, situação e resposta em rascunho. Alterações internas transacionais. Não envia mensagens; encerramento por macro não dispara NPS. |
| Listas filtradas salvas | Filtros compartilhados de caixa, nome, fila, etiqueta, número e situação. Acesso na lista do WhatsApp e em Operações. |
| Protocolo | Identificação estável por conversa, formada por data e UUID completo. Não é uma sequência por novo episódio de atendimento. |
| Spam e bloqueio | Bloqueio por número e contato, conferido nos envios e nas respostas automáticas. Recebimento continua preservado. |
| Consentimento | Registros com evidência de consentimento, retirada e pedido de exclusão. Retirada entra na lista de parada de campanhas/cobranças. Pedido de exclusão não apaga histórico automaticamente. Não representa certificação ou adequação integral à LGPD. |
| Origem | Registro manual de origem/campanha e captura da referência de anúncio enviada pela Meta no webhook. UTMs de uma página não atravessam automaticamente um link `wa.me`. |
| Campanhas | Segmentação por etiqueta exata e situação do cliente; importação de `Nome;Telefone` com deduplicação e declaração humana de autorização; agendamento na interface. Mantém rascunho, aprovação, interruptor, limite de 10.000 e lotes de 20/minuto. Importação não cria cadastros de clientes. |
| Recibos | Novos envios de campanha ficam ligados à mensagem, permitindo relatório por aceite, entrega e leitura reais recebidos do provedor. Campanhas antigas sem vínculo são identificadas; não se presume entrega. Respostas ainda não são atribuídas a uma campanha. |
| Relatórios | Situação das sessões de triagem, execuções de automações e etapa atual dos leads vinculados ao Chat. Não se apresenta etapa atual como taxa histórica de conversão. NPS já existia. |
| Botões/listas | Triagem pela API oficial usa botões ou lista, conforme a quantidade/tamanho das opções. Respostas usam identificador estável. QR mantém alternativa numerada. Preservados limite diário do bot e opção de atendente humano. |
| Modelos Meta | Cadastro de modelo de texto fixo, sem variáveis, para submissão à Meta. Exige conta oficial com WABA ID e permissão. Fica pendente; sincronização determina aprovação real. Não submete modelos sozinho. |
| Cobrança | Reutiliza links de cobranças Asaas já existentes, em aberto, do mesmo lançamento/cliente e valor restante. O compositor também permite escolher um link existente, respeitando acesso financeiro e sigilo. Não cria nova cobrança. Fora da janela Meta permanece o contrato do modelo aprovado. |
| API | Envio de texto WhatsApp e resposta de e-mail, com escopo novo `chat:send`, declaração de aprovação humana e chave de idempotência. Permissões e bloqueios conferidos no servidor. Não é prova técnica de que um humano aprovou: o integrador deve coletar a aprovação real. |
| Webhooks | `chat.message.received`, `chat.message.sent`, `chat.message.status` e `chat.conversation.updated`. Eventos carregam identificadores e situação, sem texto, telefone ou e-mail do cliente. Usam a fila assinada existente. |
| RUTE / MCP / ferramentas REST | Catálogo compartilhado para recursos do Chat, dados do atendimento, sugestões, execução de macro interna e leitura de atendimentos de e-mail. Macros não enviam mensagens externas. |
| Link WhatsApp | Gerador de link com número e mensagem, em Operações. Não cria anúncio nem atribui UTMs por conta própria. |

## E-mail como canal

Disponível em `/atendimento/email`, com configuração em `/atendimento/operacoes`. Uma caixa por escritório nesta entrega, compartilhada com os perfis que têm acesso ao Chat. Credenciais cifradas, configuração protegida por permissão de gerenciar Chat e 2FA cadastrado. Salvar desliga a caixa; ligar confere IMAP e SMTP sem enviar mensagem de teste.

Recebimento: IMAP com TLS na porta 993, leitura sem marcar mensagens como lidas no provedor; primeira leitura considera os 50 e-mails mais recentes, até 20 importados por execução. Máximo de 2 MB por mensagem bruta, incluindo anexos. Mensagens maiores são puladas com aviso no painel e continuam disponíveis no provedor. O histórico antigo não é importado integralmente. UID/UIDVALIDITY e Message-ID evitam importações repetidas. Referências de resposta agrupam atendimentos quando remetente e conta coincidem.

Resposta: SMTP 465/TLS ou 587/STARTTLS obrigatório. Somente texto nesta entrega, sem CC/CCO ou anexos de saída. Histórico com responsável, fila, encerramento e bloqueio do atendimento; anexos recebidos têm download autenticado e entram na cota de armazenamento. HTML não é exibido e imagens remotas não são carregadas. O endereço informado pelo remetente não comprova identidade.

As sugestões de resposta, reescrita e tradução do e-mail usam a mesma chave de IA, interruptor e base do Chat, com revisão humana. Status `SENT` significa aceite pelo SMTP; não comprova entrega nem leitura. Resultado incerto não é reenviado automaticamente com a mesma chave. Não há campanhas de e-mail nesta entrega.

O agendador existente de extras do Chat consulta caixas habilitadas. Sem agendador, use Sincronizar agora. Gmail com senha de aplicativo depende da política da conta. Contas que exigem OAuth, incluindo muitas configurações Microsoft 365, precisam de conector específico; não foi implementado OAuth Gmail/Outlook nem sincronização Google Agenda.

## Contratos de envio

`POST /api/v1/chat/conversations/{id}/messages`

Cabeçalhos: `Authorization: Bearer <chave>` com `chat:send`; `Idempotency-Key` com 12–120 caracteres alfanuméricos, hífen ou sublinhado. Corpo JSON: `{"text":"mensagem revisada","approvedByHuman":true}`.

`POST /api/v1/chat/email/conversations/{id}/messages`

Mesmos cabeçalhos e corpo; para e-mail, `Idempotency-Key` deve ser um UUID. O destinatário é o remetente do atendimento selecionado, exibido na interface. Não permite escolher outro destinatário pelo endpoint.

Chave repetida com outro conteúdo é recusada. Tentativa em andamento/incerta exige conferência; não se deve trocar a chave automaticamente para contornar a proteção. n8n e Zapier podem usar HTTP, mas **homologação real nesses produtos não foi realizada**.

## O que continua pendente

Não foram implementados nesta rodada: chat ao vivo/formulário do site, editor e publicação de WhatsApp Flows, mesclagem transacional de cadastros duplicados, pontuação de leads configurável, marketplace/ERP/e-commerce/catálogo, SSO/passkeys/dispositivos confiáveis, aplicativo nativo, OAuth Gmail/Outlook e Google Agenda. Certificações ISO/SOC exigem processo e auditoria externos. Não são funções que um commit possa conceder.

Instagram, Messenger, Telegram, SMS e telefonia foram retirados do escopo pelo usuário. A operação real de Meta, SMTP/IMAP e Asaas continua dependendo de contas, permissões e homologação autorizada. Nenhuma conta real foi conectada, campanha aprovada ou mensagem a cliente enviada para testar esta entrega.

## Implantação e validação

Aplicar as migrations `20261228000000_chat_workbench`, `20261228010000_chat_api_outbox` e `20261228020000_chat_email` pelo runner SQL existente. Não usar `prisma db push`: as tabelas novas usam consultas parametrizadas e migrations versionadas. O copiloto e o canal de e-mail começam desligados.

Validação desta versão: compilação de produção; TypeScript; lint de `src`; 167 testes de integração de Chat, WhatsApp, e-mail, API e planos; 20 testes unitários. Provedores externos foram simulados. A adaptação dos testes de triagem confere o novo tipo interativo; o teste QR aguarda a conclusão assíncrona da ingestão antes de conferir não lidas.
