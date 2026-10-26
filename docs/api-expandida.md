# API LegalOS — catálogo compartilhado com RUTE e MCP

Atualização: 24/10/2026. Esta documentação descreve a implementação deste lote; a disponibilidade no site depende da publicação da versão.

## O que foi entregue

O catálogo passou de **52 para 82 funções: 52 consultas e 30 propostas de alteração**. As mesmas funções são chamadas por três entradas:

- **RUTE:** a pessoa pede em linguagem natural; o modelo seleciona uma função e fornece seus argumentos.
- **API REST:** uma integração chama a função diretamente por HTTP, sem precisar de chave Gemini ou de interpretar texto com IA.
- **MCP:** um cliente compatível descobre e chama o mesmo catálogo por `tools/list` e `tools/call`.

A lógica continua nos serviços do LegalOS. As entradas compartilham validação, permissões, isolamento por escritório, mascaramento e auditoria. O modelo não ganha acesso direto ao banco.

Esta entrega acrescenta 20 consultas e 10 propostas. Não significa que todos os serviços internos estejam expostos: a lista abaixo é o escopo implementado.

## Acesso e permissões

Crie a chave pela gestão de integrações do LegalOS. O gerenciamento de chaves exige a configuração de segurança prevista na plataforma, inclusive 2FA. Ative o acesso externo da RUTE/MCP e, para propostas, a funcionalidade de propostas.

Envie `Authorization: Bearer SUA_CHAVE`. A chave atua com as permissões atuais da pessoa que a criou e dentro de seu escritório. Os escopos REST e MCP são independentes:

| Uso | Escopo |
|---|---|
| Consultar ferramentas por REST | `tools:read` |
| Criar propostas por REST | `tools:propose` |
| Consultar ferramentas por MCP | `mcp:read` |
| Criar propostas por MCP | `mcp:propose` |

Também é necessária a permissão `ai:use` e a permissão específica de cada função, como `finance:read`, `cases:write` ou `templates:manage`. Uma chave com escopo amplo não concede permissões que seu titular não possui. O catálogo retornado é filtrado por essas permissões.

## Endpoints

| Método | Caminho | Uso |
|---|---|---|
| GET | `/api/v1/tools` | Catálogo autorizado com argumentos e permissões |
| POST | `/api/v1/tools/{name}` | Chamar uma função; corpo JSON contém os argumentos diretamente |
| GET | `/api/v1/openapi` | Contrato OpenAPI gerado a partir do catálogo |
| POST | `/api/mcp` | Chamadas MCP JSON-RPC |
| GET | `/api/v1/me` | Identidade da conexão |
| GET | `/api/v1/clients`, `/api/v1/clients/{id}` | Recursos de clientes |
| GET | `/api/v1/cases`, `/api/v1/cases/{id}` | Recursos de processos |
| GET | `/api/v1/deadlines` | Recurso de prazos |
| GET | `/api/v1/notices`, `/api/v1/notices/{id}` | Recursos de intimações |
| POST | `/api/v1/notices` | Criar intimação; integração existente com identificação externa |

Os endpoints de recursos usam seus próprios escopos (`clients:read`, `cases:read`, `deadlines:read`, `notices:read` e `notices:write`). As 82 funções não correspondem a 82 novos CRUDs de recursos; ficam disponíveis pela rota de ferramentas, com nomes e contratos próprios.

## Exemplos REST

Consultar o plano do dia de quem está conectado:

```http
POST /api/v1/tools/organizar_dia
Authorization: Bearer SUA_CHAVE
Content-Type: application/json

{"date":"2026-10-26","page":1,"limit":20}
```

Para outro responsável, acrescente `assigneeId`, obtido em `listar_equipe`. A resposta inclui tarefas, prazos e compromissos abertos atribuídos à pessoa naquela data, com links internos. Não inclui registros sem data ou sem responsável. Não cria links de Meet nem envia resumos.

Localizar a última mensagem recebida de um contato:

```http
POST /api/v1/tools/listar_conversas_chat

{"q":"Nome do contato","status":"ALL"}
```

Em seguida, use o ID retornado:

```http
POST /api/v1/tools/ler_conversa_chat

{"id":"UUID_DA_CONVERSA","direction":"IN","limit":1}
```

Havendo homônimos, confirme o contato. Essas consultas não marcam mensagens como lidas.

Preparar um centro de custo:

```http
POST /api/v1/tools/propor_centro_custo

{"name":"Contencioso"}
```

A resposta identifica uma proposta. **O centro de custo só é criado após aprovação humana no LegalOS.** Consulte `ver_proposta` para saber a situação e o resultado. Não interprete a criação de uma proposta como execução concluída.

A resposta REST de sucesso possui `data` e `meta`, incluindo `tool` e `truncated`. Erros retornam códigos HTTP: 403 para permissão, 404 para recurso não encontrado/acessível, 409 para conflito e 422 para argumentos inválidos. Consulte o OpenAPI para o contrato atualizado.

## Usar no n8n

1. Adicione um nó HTTP Request e configure a credencial Bearer em armazenamento de credenciais do n8n.
2. Use método POST e URL `https://www.legalossync.tech/api/v1/tools/organizar_dia`.
3. Configure corpo JSON com a data e, se necessário, `assigneeId`.
4. Leia o objeto `data` da resposta e confira `meta.truncated`.
5. Para operações `propor_*`, acompanhe a proposta; não configure o fluxo como se o registro já tivesse sido criado.

Consultas podem ser repetidas. Propostas ainda não possuem chave geral de idempotência HTTP: repetição automática pode criar propostas duplicadas. Desative retries cegos para essas chamadas e registre o ID da proposta no fluxo.

## Usar por MCP

O servidor atende em `https://www.legalossync.tech/api/mcp`. O cliente precisa suportar o transporte e a autenticação implementados no LegalOS; compatibilidade com cada produto deve ser validada na conexão.

Exemplo de chamada após a inicialização MCP:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"organizar_dia","arguments":{"date":"2026-10-26"}}}
```

Use `tools/list` para descobrir as funções autorizadas. O servidor também possui fluxo OAuth; isso não implica que qualquer aplicativo possa ser conectado sem configuração. Não há assinatura de eventos SSE ou sessão MCP persistente nesta implementação.

## Novas funções deste lote

| Área | Consultas novas |
|---|---|
| Operação | `organizar_dia`, `carga_equipe`, `minhas_notificacoes` |
| Financeiro | `listar_contas_financeiras`, `listar_categorias_financeiras`, `listar_centros_custo` |
| Processos | `listar_notas_processo`, `listar_processos_vinculados`, `listar_recursos_processo` |
| Tarefas | `listar_tipos_tarefa`, `listar_etiquetas_tarefa`, `listar_etapas_tarefa`, `ver_classificacao_tarefa`, `historico_tarefa` |
| Documentos | `listar_modelos_documento`, `ver_modelo_documento`, `listar_autotextos` |
| Automações | `listar_regras_workflow`, `ver_regra_workflow` |
| Clientes | `listar_etiquetas_clientes` |

| Proposta nova | Efeito após aprovação |
|---|---|
| `propor_processo` | Cadastrar processo internamente; não distribuir ação em tribunal |
| `propor_oportunidade` | Criar oportunidade no CRM |
| `propor_conta_financeira` | Criar cadastro de conta e saldo inicial; não transferir dinheiro |
| `propor_categoria_financeira` | Criar categoria |
| `propor_centro_custo` | Criar centro de custo |
| `propor_registro_horas` | Registrar horas da própria pessoa conectada |
| `propor_autotexto` | Criar bloco reutilizável |
| `propor_modelo_documento` | Criar modelo textual com variáveis validadas pelo serviço |
| `propor_quadro_kanban` | Criar quadro com colunas iniciais |
| `propor_etapa_tarefa` | Mudar etapa de tarefa existente |

Conta financeira, processo e mudança de etapa exigem confirmação reforçada. Alteração de etapa verifica a versão da tarefa registrada na proposta. IDs e dados de versão não podem ser trocados pela edição da proposta.

## Limites e próximos passos

- `capacidades` agora aceita `q`, `page` e `limit` (até 50; padrão 30). Confira `tem_mais` para continuar a descoberta.
- Novas listas paginadas usam `page` e `limit` (até 30; padrão 20). `total_observado` conta o conjunto retornado pelo serviço; `fonte_limitada` avisa quando esse serviço pode ter cortado resultados antes da paginação. Não o trate sempre como total exato do banco.
- O plano do dia usa fonte limitada a 300 atividades; o campo `total` informa o total contado e `fonte_limitada` indica corte.
- Respostas de ferramentas têm limite de 24 mil caracteres. Se `truncated` for verdadeiro, reduza o filtro ou o tamanho da página; o retorno estruturado pode estar ausente.
- O limite HTTP existente é de 256 KB para JSON e 120 requisições por minuto. O controle de taxa atual é em memória, não distribuído entre réplicas.
- CPF, CNPJ e e-mails são mascarados nas respostas das ferramentas; isso não substitui controles de acesso e não equivale a anonimização completa de todos os campos.
- Não foram implementados neste lote: execução autônoma de propostas, idempotência geral, jobs públicos de longa duração, CRUD completo de todos os módulos, novos eventos de webhook, criação de Meet/Calendar, envio de resumos ou homologação de tribunais.
- Certificados, tokens e senhas dos cofres não são publicados como ferramentas. Conexões externas continuam dependendo de configuração e homologação próprias.
- Próxima expansão recomendada: idempotência e jobs; cobertura de escrita por domínio; webhooks adicionais; testes de ponta a ponta em clientes MCP externos e n8n.

## Catálogo completo

Os nomes abaixo identificam as 82 funções. Os argumentos obrigatórios e permissões devem ser consultados no catálogo autenticado ou no OpenAPI, que acompanham o código.

### Consultas (52)

- `agenda`
- `andamentos_do_processo`
- `biblioteca_do_escritorio`
- `buscar_clientes`
- `buscar_conteudo_documentos`
- `buscar_documentos`
- `buscar_lancamentos`
- `buscar_oportunidades`
- `buscar_processos`
- `capacidades`
- `carga_equipe`
- `historico_tarefa`
- `hoje`
- `indicadores_escritorio`
- `ler_conversa_chat`
- `listar_atividades`
- `listar_autotextos`
- `listar_categorias_financeiras`
- `listar_centros_custo`
- `listar_contas_financeiras`
- `listar_conversas_chat`
- `listar_equipe`
- `listar_etapas_tarefa`
- `listar_etiquetas_clientes`
- `listar_etiquetas_tarefa`
- `listar_intimacoes`
- `listar_modelos_documento`
- `listar_notas_processo`
- `listar_pacotes_workflow`
- `listar_prazos`
- `listar_processos_vinculados`
- `listar_propostas`
- `listar_recursos_processo`
- `listar_regras_workflow`
- `listar_tarefas`
- `listar_tipos_tarefa`
- `minhas_notificacoes`
- `organizar_dia`
- `produtividade_equipe`
- `resumo_financeiro`
- `ver_classificacao_tarefa`
- `ver_cliente`
- `ver_compromisso`
- `ver_detalhes_atividade`
- `ver_intimacao`
- `ver_modelo_documento`
- `ver_oportunidade`
- `ver_prazo`
- `ver_processo`
- `ver_proposta`
- `ver_regra_workflow`
- `ver_tarefa`

### Propostas (30)

- `propor_andamento`
- `propor_anotacao`
- `propor_atualizacao_cliente`
- `propor_atualizacao_compromisso`
- `propor_atualizacao_tarefa`
- `propor_autotexto`
- `propor_cancelamento_compromisso`
- `propor_categoria_financeira`
- `propor_centro_custo`
- `propor_checklist_tarefa`
- `propor_cliente`
- `propor_colaborador_tarefa`
- `propor_comentario_tarefa`
- `propor_compromisso`
- `propor_conta_financeira`
- `propor_envio_para_revisao`
- `propor_etapa_tarefa`
- `propor_execucao_workflow`
- `propor_minuta`
- `propor_modelo_documento`
- `propor_oportunidade`
- `propor_peticao`
- `propor_prazo`
- `propor_processo`
- `propor_quadro_kanban`
- `propor_recorrencia_tarefa`
- `propor_registro_horas`
- `propor_situacao_compromisso`
- `propor_situacao_tarefa`
- `propor_tarefa`
