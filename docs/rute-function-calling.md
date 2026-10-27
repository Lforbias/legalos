# RUTE: API, MCP e function calling

O catálogo em `rute-tools.service.ts` é compartilhado pela RUTE interna, pela REST (`/api/v1/tools`) e pelo MCP (`/api/mcp`). Cada canal mantém sua autenticação e seus escopos; a função de domínio e suas permissões são comuns. Comandos `propor_*` geram propostas para revisão humana. Ações diretas exigem escopo `execute` explícito.

## Consulta relacional

Exemplo de intenção: “O que está pendente para Ana?”.

1. `buscar_clientes({"q":"Ana"})`: obter o ID real. Havendo homônimos, esclarecer qual pessoa.
2. `listar_atividades({"clientId":"UUID retornado"})`: tarefas, compromissos e prazos abertos ligados diretamente ao cliente ou aos processos em que é parte. Sem filtro de data inclui tarefas sem vencimento. Os filtros combinam por interseção; registros encontrados pelos dois caminhos aparecem uma única vez.
3. `buscar_lancamentos({"clientId":"UUID retornado","status":"aberto"})`: financeiro, conforme a permissão própria. O filtro financeiro mantém a semântica do serviço financeiro.
4. Consultar detalhes antes de propor alterações; usar os IDs retornados e apresentar as propostas para confirmação.

`listar_atividades` retorna `items`, `total` e `truncated`; a projeção é limitada a 300 registros. Nunca confundir a quantidade retornada com o total quando houver truncamento. Sigilo e isolamento entre escritórios continuam aplicados a tarefas, compromissos e prazos.

## Contratos e recuperação de erros

Os contratos de leitura são gerados dos validadores Zod. As descrições dos campos são preservadas. Propostas usam o esquema específico da proposta, pois seu validador inicial é genérico.

Argumentos desconhecidos são rejeitados com `422 / validation_error`, antes de executar a função. Isso evita ignorar um filtro inexistente e retornar dados de uma busca mais ampla.

`capacidades({"name":"listar_atividades"})` retorna o contrato completo autorizado: tipos, campos, obrigatórios e exigência de confirmação. Sem `name`, o catálogo continua paginado. Em erro de parâmetro, a RUTE deve consultar o contrato, corrigir e tentar novamente.

## Caminho até voz

Esta entrega corrige a base de funções; ainda não implementa voz. As próximas etapas são ampliar relações em documentos/CRM/financeiro, persistir referências estruturadas entre turnos, definir operações compostas com resultado por etapa e testar intenções reais de ponta a ponta. O transporte de voz deve reutilizar essas operações, permissões e confirmações.

## Validação e publicação

Testes cobrem relação direta e por processo, sigilo, isolamento de escritório, descoberta do contrato e rejeição de argumentos inválidos, além dos fluxos REST e busca do Chat. Alterações locais só chegam ao site após publicação.

## Ações diretas

19 comandos gravam imediatamente, usando os mesmos serviços das telas:

- `criar_cliente`, `atualizar_cliente`, `criar_processo`, `criar_oportunidade`;
- `criar_tarefa`, `atualizar_tarefa`, `alterar_situacao_tarefa`, `comentar_tarefa`, `criar_checklist_tarefa`, `alterar_etapa_tarefa`;
- `criar_compromisso`, `atualizar_compromisso`, `alterar_situacao_compromisso`;
- `criar_modelo_documento`, `criar_autotexto`, `registrar_horas`;
- `criar_categoria_financeira`, `criar_centro_custo`, `criar_quadro_kanban`.

REST exige `tools:execute`; MCP exige `mcp:execute`. Recomendado combinar com o escopo de leitura do mesmo canal para resolver nomes e verificar o resultado. Chaves existentes não recebem execução automaticamente. OAuth sem escopo explícito continua solicitando somente leitura e propostas. Cada chamada exige também `ai:use`, a permissão da operação e o interruptor MCP ativo; a parada de emergência bloqueia execução. Auditoria de domínio e evento `rute.action_execute` identificam a ação e a origem.

A RUTE interna agora anuncia as 19 acoes diretas conforme permissoes. Pedidos explicitos de criacao/alteracao podem executar imediatamente; perguntas e hipoteses nao autorizam escrita. O chat exibe a acao executada e o ID do registro. Repeticoes identicas na mesma resposta reutilizam o resultado salvo; nao existe idempotencia entre mensagens. Falhas do provedor posteriores a uma acao preservam a referencia ao registro salvo. Chaves externas existentes nao receberam novos escopos.

Exemplo REST, com chave autorizada:

```http
POST /api/v1/tools/criar_tarefa
Authorization: Bearer SUA_CHAVE
Content-Type: application/json

{"title":"Conferir documentos","clientId":"UUID_DO_CLIENTE","dueDate":"2026-11-10"}
```

Resposta: `data.executed = true`, `data.type = "task"`, ID e link do registro. Para campos aceitos, use o catálogo autenticado `GET /api/v1/tools`. Na criação de tarefa, campos opcionais recebem valores padrão e responsável omitido significa tarefa sem responsável.

Atualizações de cliente, tarefa e compromisso aceitam `expectedUpdatedAt` (ISO) para rejeitar contexto antigo com 409. Campos omitidos são preservados. A data deve vir do registro consultado. Esta precondição utiliza a proteção de versão existente nos serviços e não representa uma transação de múltiplas ações.

Não existe garantia de idempotência para criações: repetir uma chamada pode duplicar um registro. Após timeout ou erro de conexão, consulte antes de repetir. As ações internas podem acionar notificações e regras que o próprio serviço da plataforma já possui. Os comandos não acrescentam envio de WhatsApp, protocolo judicial, transferência, emissão de cobrança, exclusão permanente ou concessão de acesso.

## Confiabilidade das consultas e ações no chat

O seletor da conversa agora controla os escopos no servidor em cada mensagem:

- **Consultar** anuncia e permite somente ferramentas de leitura. Mesmo uma chamada de escrita inventada pelo provedor é recusada.
- **Criar e alterar** disponibiliza as ações permitidas pelo perfil. A pessoa ainda precisa fazer um pedido explícito; perguntas e dados retornados das ferramentas não autorizam gravações.

O seletor continua visível depois da primeira resposta. A data, hora e o fuso do escritório entram no contexto da conversa. As referências persistidas incluem os argumentos mascarados, até 20 IDs e nomes retornados por consulta e o tipo do registro criado. Até oito referências por mensagem anterior são reapresentadas como dados históricos, com limite de tamanho. A RUTE deve consultar o estado atual antes de alterar. Isso vale dentro da mesma conversa, sem memória global entre conversas.

Cada envio da interface recebe um UUID. O servidor registra a solicitação antes de chamar a IA e conserva o resultado. Repetir a mesma solicitação concluída devolve a resposta anterior sem chamar novamente o provedor ou criar outro registro. Reutilizar o UUID com outro texto/modo é recusado. Duas solicitações simultâneas na mesma conversa são bloqueadas. Em interrupção, o mesmo UUID não executa novamente; a pessoa precisa conferir o histórico e os registros antes de fazer outro pedido. Uma execução abandonada deixa de bloquear novas solicitações após 30 minutos, sem liberar a repetição do pedido original.

Essa proteção é por identificador de envio do **chat interno**, não por semelhança de texto: um novo pedido tem outro identificador. Ela não acrescenta idempotência às ações diretas de REST/MCP. Registros de solicitação seguem a exclusão/retencão da conversa por vínculo com exclusão em cascata.

Os cartões de ação usam o tipo retornado para abrir também oportunidades, modelos, autotextos e cadastros financeiros. A etapa mantém as funções de domínio existentes; voz e operações compostas com recuperação por etapa continuam para entregas futuras.
