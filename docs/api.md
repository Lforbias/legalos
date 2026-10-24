# API do LegalOS (v1)

API REST em JSON para ligar o LegalOS a outros sistemas (planilhas, automações, site do escritório). Base: `https://SEU-DOMINIO/api/v1`.

## Chaves de API

Crie em **Integrações → API do LegalOS** (exige permissão `integrations:manage` **e** 2FA ativo). O token aparece **uma única vez**; o banco guarda apenas o hash SHA-256. Formato: `lgos_<8 hex>_<43 caracteres>`.

- A chave **age como quem a criou**: mesmas permissões e mesmas regras de sigilo (processo sigiloso só aparece se o criador pode ver). Limitada aos acessos marcados.
- Para de funcionar se o criador for suspenso/removido, perder a permissão equivalente, ou se o escritório for suspenso.
- Validade opcional (30 dias a 2 anos); revogação imediata na tela. Até 20 chaves ativas por escritório. Criação e revogação são auditadas (sem o token).

Acessos (escopos): `cases:read`, `clients:read`, `deadlines:read`, `notices:read`, `notices:write`.

## Autenticação, limites e erros

`Authorization: Bearer lgos_...`. Respostas sempre com `Cache-Control: no-store`.

- Limite: 120 requisições/minuto por chave; 30 tentativas inválidas/minuto por IP (estado em memória do processo — com várias instâncias, trocar por Redis).
- Erros: `{"error":{"code","message","fields?"}}` — `401 unauthorized`, `403 insufficient_scope`/`forbidden`, `404 not_found`, `409 conflict`, `422 validation_error`, `429 rate_limited` (com `Retry-After`), `500 internal_error` (com referência).
- Corpo de POST: `application/json`, objeto, até 256 KB.

## Paginação

Listas devolvem `{"data":[...],"nextCursor":"..."|null"}`, ordenadas do mais novo ao mais antigo. Parâmetros: `limit` (1–100, padrão 50) e `cursor` (o `nextCursor` anterior). Cursor por chave (data de criação + id): não repete nem perde itens quando surgem registros novos.

## Rotas

| Método e rota | Acesso | Filtros |
|---|---|---|
| `GET /me` | qualquer chave válida | — (devolve escritório e acessos efetivos; serve para testar a conexão) |
| `GET /cases`, `GET /cases/{id}` | `cases:read` | `status` (ACTIVE, SUSPENDED, ARCHIVED, CLOSED), `number` (CNJ exato) |
| `GET /clients`, `GET /clients/{id}` | `clients:read` | `status` (PROSPECT, ACTIVE, INACTIVE), `q` (parte do nome) |
| `GET /deadlines` | `deadlines:read` | `status` (DRAFT, VALIDATED, FULFILLED, CANCELED), `caseId`, `from`, `to` (AAAA-MM-DD, sobre o vencimento) |
| `GET /notices`, `GET /notices/{id}` | `notices:read` | `status` (NEW, DISTRIBUTED, PROCESSED, DISCARDED), `caseId` (a lista não traz o teor; o detalhe traz `content`) |
| `POST /notices` | `notices:write` | corpo abaixo |

Não expostos de propósito: anotações internas de clientes e processos, documentos (arquivos), financeiro. Datas puras vão como `AAAA-MM-DD`; instantes em ISO 8601 (UTC).

### POST /notices

```json
{
  "title": "Intimação para manifestação",
  "content": "Fica intimada a parte...",
  "kind": "INTIMACAO",
  "caseNumber": "0000001-02.2024.8.05.0001",
  "court": "TJBA",
  "publishedAt": "2026-10-16",
  "receivedAt": "2026-10-17",
  "externalId": "erp-123"
}
```

Obrigatórios: `title`, `content`. `kind`: INTIMACAO (padrão), CITACAO, DESPACHO, DECISAO, SENTENCA, OUTRO. `caseNumber` precisa ter dígito verificador CNJ válido; se o processo existir (e for visível ao criador), a intimação é vinculada automaticamente. `receivedAt` padrão: hoje no fuso do escritório. `externalId` torna o envio **idempotente**: repetir devolve a mesma intimação (`200`, `created:false`); a primeira vez devolve `201`. A intimação entra na caixa de entrada com origem "importada" e dispara as automações de "intimação recebida", como qualquer outra.

### Exemplo

```bash
curl -H "Authorization: Bearer $LEGALOS_KEY" "https://SEU-DOMINIO/api/v1/cases?status=ACTIVE&limit=20"
```

## Limites e próximos passos

- Somente leitura (exceto intimações); não há criação/edição de processos, clientes ou prazos pela API.
- Webhooks: veja a seção abaixo.
- Sem versionamento além do prefixo `/v1`; mudanças que quebrem contrato irão para `/v2`.

## Webhooks

Em **Integrações → Webhooks** (permissão `integrations:manage`, 2FA para criar/remover) cadastre um endereço `https://` e os eventos desejados. O LegalOS faz `POST` em JSON nesse endereço quando o evento acontece.

Eventos: `notice.created` (intimação registrada, inclusive via API/DJEN/MNI; duplicatas não geram aviso), `case.created`, `deadline.created`, e `ping` (botão "Enviar teste").

Corpo (carga mínima: só identificadores — busque os detalhes pela API com uma chave; processo sigiloso continua protegido por lá):

```json
{ "id": "evento-uuid", "type": "notice.created", "createdAt": "2026-10-18T12:00:00.000Z",
  "data": { "noticeId": "…", "caseId": "…|null", "source": "MANUAL" } }
```

Cabeçalhos: `X-LegalOS-Event`, `X-LegalOS-Delivery` (id da entrega; use para deduplicar) e `X-LegalOS-Signature: t=<unix>,v1=<hex>`, onde `v1 = HMAC-SHA256(segredo, "<t>.<corpo bruto>")`. O segredo (`whsec_…`) aparece **uma vez**, na criação. O receptor deve (1) recalcular o HMAC sobre o corpo bruto, comparando em tempo constante; (2) recusar `t` com mais de 5 minutos; (3) responder `2xx` em até 10 s.

```js
const crypto = require("crypto");
function valid(secret, rawBody, header) {
  const t = /t=(\d+)/.exec(header)?.[1], v1 = /v1=([0-9a-f]+)/.exec(header)?.[1];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const mac = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return mac.length === v1.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(v1));
}
```

Entrega e repetição: não há processo em segundo plano; um agendador deve chamar **a cada minuto** `POST /api/cron/webhooks` com `Authorization: Bearer $CRON_SECRET` (ex.: `* * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/webhooks`). Falhou? Novas tentativas após 1 min, 5 min, 30 min, 2 h e 6 h (6 no total); depois fica "Falhou" e pode ser reenviada na tela. Após 30 falhas seguidas o webhook é desligado automaticamente (religue na tela). A ordem de chegada **não é garantida** e pode haver entrega repetida: deduplique por `X-LegalOS-Delivery`/`id`. Histórico mantido por 30 dias.

Segurança: só https, nome de domínio público (IP, localhost e `.internal` recusados no cadastro; o DNS é revalidado a cada conexão contra rede interna), redirecionamentos não são seguidos, TLS sempre verificado.

## Ferramentas compartilhadas com RUTE e MCP (expansão)

Crie uma chave com `tools:read` e/ou `tools:propose` em Integrações. A permissão de cada módulo continua sendo exigida; estes escopos não concedem acesso MCP. Habilite o acesso externo da RUTE e o consentimento correspondente. A parada de emergência interrompe ferramentas externas.

- `GET /api/v1/tools`: catálogo de ferramentas autorizado à chave, com nomes, descrições e esquemas de entrada.
- `POST /api/v1/tools/{name}`: envie os argumentos diretamente no objeto JSON. Resultado: `{ data, meta: { tool, truncated } }`. Se exceder o limite, `data` é nulo e `meta.content` traz o texto limitado; refine a consulta. Não trate listas limitadas como exportação completa.
- `GET /api/v1/openapi`: contrato OpenAPI 3.1 autenticado, com ferramentas filtradas pelos escopos e permissões da chave.

Exemplo sem dados pessoais:

```bash
curl -H "Authorization: Bearer $LEGALOS_KEY" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  https://SEU-DOMINIO/api/v1/tools/indicadores_escritorio
```

As quinze ferramentas `propor_*` apenas registram uma proposta pendente de decisão humana no LegalOS. A origem é registrada como API; nenhuma delas envia mensagem ao cliente ou protocola no tribunal. Esta API de ferramentas não depende de chave Gemini/Claude/OpenAI, pois a aplicação externa pode chamar diretamente o serviço autorizado.

Catálogo completo, limites e cobertura por módulo: [Inventário de RUTE, REST e MCP](inventario-api-mcp.md).


O catálogo atual possui 35 ferramentas compartilhadas. Além das consultas, há propostas para cadastro/atualização básica de clientes, edição/comentário/situação de tarefas e criação/edição/cancelamento de compromissos. `capacidades`, `listar_propostas` e `ver_proposta` permitem descobrir e acompanhar operações. A confirmação pode ser feita pela pessoa no chat interno do LegalOS. Campos de destino e versão não podem ser modificados pela edição de uma proposta; alterações concorrentes exigem nova proposta.
