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
Idempotency-Key: tarefa-conferir-20261027-001

{"title":"Conferir documentos","clientId":"UUID_DO_CLIENTE","dueDate":"2026-11-10"}
```

Resposta: `data.executed = true`, `data.type = "task"`, ID e link do registro. Para campos aceitos, use o catálogo autenticado `GET /api/v1/tools`. Na criação de tarefa, campos opcionais recebem valores padrão e responsável omitido significa tarefa sem responsável.

Atualizações de cliente, tarefa e compromisso aceitam `expectedUpdatedAt` (ISO) para rejeitar contexto antigo com 409. Campos omitidos são preservados. A data deve vir do registro consultado. Esta precondição utiliza a proteção de versão existente nos serviços e não representa uma transação de múltiplas ações.

Nas ferramentas externas de escrita, envie a chave de idempotência descrita abaixo. Repetir a mesma chave e argumentos recupera o resultado; uma chave nova representa uma nova operação e pode criar outro registro. Após resultado incerto, consulte antes de fazer um novo pedido. As ações internas podem acionar notificações e regras que o próprio serviço da plataforma já possui. Os comandos não acrescentam envio de WhatsApp, protocolo judicial, transferência, emissão de cobrança, exclusão permanente ou concessão de acesso.

## Confiabilidade das consultas e ações no chat

O seletor da conversa agora controla os escopos no servidor em cada mensagem:

- **Consultar** anuncia e permite somente ferramentas de leitura. Mesmo uma chamada de escrita inventada pelo provedor é recusada.
- **Criar e alterar** disponibiliza as ações permitidas pelo perfil. A pessoa ainda precisa fazer um pedido explícito; perguntas e dados retornados das ferramentas não autorizam gravações.

O seletor continua visível depois da primeira resposta. A data, hora e o fuso do escritório entram no contexto da conversa. As referências persistidas incluem os argumentos mascarados, até 20 IDs e nomes retornados por consulta e o tipo do registro criado. Até oito referências por mensagem anterior são reapresentadas como dados históricos, com limite de tamanho. A RUTE deve consultar o estado atual antes de alterar. Isso vale dentro da mesma conversa, sem memória global entre conversas.

Cada envio da interface recebe um UUID. O servidor registra a solicitação antes de chamar a IA e conserva o resultado. Repetir a mesma solicitação concluída devolve a resposta anterior sem chamar novamente o provedor ou criar outro registro. Reutilizar o UUID com outro texto/modo é recusado. Duas solicitações simultâneas na mesma conversa são bloqueadas. Em interrupção, o mesmo UUID não executa novamente; a pessoa precisa conferir o histórico e os registros antes de fazer outro pedido. Uma execução abandonada deixa de bloquear novas solicitações após 30 minutos, sem liberar a repetição do pedido original.

Essa proteção é por identificador de envio do **chat interno**, não por semelhança de texto: um novo pedido tem outro identificador. A proteção externa de REST/MCP usa as chaves próprias descritas a seguir. Registros de solicitação seguem a exclusão/retencão da conversa por vínculo com exclusão em cascata.

Os cartões de ação usam o tipo retornado para abrir também oportunidades, modelos, autotextos e cadastros financeiros. A etapa mantém as funções de domínio existentes; voz e operações compostas com recuperação por etapa continuam para entregas futuras.


## Idempotência nas ferramentas REST e MCP

**Mudança de contrato:** ferramentas de escrita (`propose` e `execute`) exigem uma chave com 12–120 caracteres, usando letras, números, `_` e `-`. Consultas continuam sem essa exigência. Integrações existentes de escrita precisam enviar a chave. A exigência está no OpenAPI e nos contratos `tools/list` do MCP.

REST: `POST /api/v1/tools/{name}` recebe `Idempotency-Key` no cabeçalho. O corpo continua contendo somente os argumentos de domínio. `meta.replayed` informa se a resposta veio do resultado já salvo.

MCP: `tools/call` recebe `idempotencyKey` dentro de `arguments`, removida antes da validação da função de domínio. Também aceita `params._meta["legalos/idempotency-key"]`; quando ambas forem enviadas, precisam coincidir. O ID JSON-RPC identifica a mensagem e **não** serve como chave de idempotência. Cada chamada de um lote precisa ter sua própria chave.

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "tools/call",
  "params": {
    "name": "criar_tarefa",
    "arguments": {
      "title": "Conferir documentos",
      "idempotencyKey": "tarefa-conferir-20261027-001"
    }
  }
}
```

O resultado MCP traz `_meta["legalos/replayed"]`. Erros de ferramenta trazem `isError=true` e `_meta["legalos/error-code"]`.

- Mesma chave, ferramenta e argumentos: devolve a resposta concluída, sem gravar novamente. A ordem das propriedades JSON não muda a identidade.
- Mesma chave com outros argumentos ou ferramenta: `409 / idempotency_conflict`.
- Operação em andamento: `409 / idempotency_in_progress`; aguarde e consulte usando a mesma chave.
- Resultado incerto: `409 / idempotency_outcome_unknown`; não há repetição automática. Confira os registros e a auditoria antes de decidir sobre uma nova operação.
- Sem chave válida em escrita: `422 / idempotency_key_required`.

Autenticação, escopos, permissões e parada de emergência são verificados novamente antes de servir uma resposta salva. O isolamento inclui escritório, usuário, canal e identidade da credencial/conexão. Outra credencial ou outro canal é outro espaço de chaves: transportar uma operação entre REST e MCP não reaproveita o registro anterior. Na renovação OAuth, a conexão conserva sua identidade. Não há expiração automática que permita reexecutar a mesma chave; os registros são removidos por exclusão em cascata do escritório/usuário.

Para n8n ou outro consumidor, gere a chave no início da operação e mantenha-a nos reenvios. Não gere um UUID novo a cada tentativa. Esta seção cobre as ferramentas `/api/v1/tools/*` e `tools/call`; outros endpoints mantêm seus contratos próprios (por exemplo, Chat com chave de envio e intimações com `externalId`).
