# LegalOS Box 3.0 — API e ferramentas desta entrega

> Cobre só o que é novo ou mudou nesta reconstrução do Box 3.0. A API HTTP do produto inteiro continua em
> `docs/api.md`/`docs/api-expandida.md`; o catálogo completo de ferramentas da RUTE (6.0) continua em
> `docs/rute-function-calling.md`.

## `GET /api/box/v3/capabilities`

`src/app/api/box/v3/capabilities/route.ts`. Disponível só com a prévia do Box 3.0 ligada
(`boxV3PreviewEnabled()` — dev ou `LEGALOS_BOX3_PREVIEW=1`); fora disso devolve 404.

- Autenticação: sessão do LegalOS (`getTenant()`); sem sessão, 401.
- Autorização: permissão BRUTA `inbox:read` (`tenant.ctx.permissions.has("inbox:read")`, não `can()` — ver
  `SECURITY.md`); sem ela, 403.
- Resposta: `{ connectors: [...], coverage: [...], checkedAt }` — `connectors` é o catálogo declarado
  (`CONNECTORS`, `src/lib/judicial/catalog.ts`); `coverage` é `coverageMatrix(evidence, now)`
  (`src/lib/judicial/evidence.ts`): conector × tribunal × operação, com o estado real
  (`NOT_IMPLEMENTED`/`UNVALIDATED`/`VALIDATED`/`STALE`/`FAILING`) e a última evidência. Nunca declara cobertura
  nacional: só tribunais com evidência real aparecem fora da linha `"*"`.
- `Cache-Control: no-store`.

## Serviço interno `src/server/judicial/box-v3.service.ts`

Não é uma rota HTTP pública — é a camada de serviço usada pelas telas (`src/app/(dashboard)/box-v3/*`, server
actions) e pelas ferramentas novas da RUTE abaixo. 37 funções exportadas, cobrindo: leitura e navegação da caixa
(pastas, busca, filtros), tratamento interno (nota, etiqueta, soneca, marcar tratada/reabrir, vínculo com
documento/processo, distribuição para pessoa ou equipe), monitoramento de sincronizações e alertas de saúde, e a
fila de peticionamento em rascunho (criar, anexar, pedir revisão, aprovar, devolver, cancelar — nunca protocola).
Toda função checa a permissão bruta do cargo (`assertBoxV3Read`/`assertBoxV3Write`) e filtra por
`organizationId` + `visibility(ctx)`/`caseVisibility(ctx)`.

## Ferramentas novas da RUTE (commit `9797a0e`)

Catálogo em `src/server/services/rute-tools.service.ts`. As três são `scope: "read"`,
`permission: "ai:use"` (ver `SECURITY.md` para o motivo de não ser `"inbox:read"`), e chamam só
`box-v3.service.ts`/`src/lib/judicial/evidence.ts` — nunca abrem uma conexão judicial própria para a IA.

### `caixa_v3_listar`

Lista comunicações da caixa do Box 3.0. Argumentos: `folder` (entrada/abertas/acervo/adormecidas, padrão
entrada), `q`, `kind`, `origin` (DJEN_PUBLICATION/PRIVATE_COMMUNICATION/PROCESS_MOVEMENT/IMPORT/MANUAL),
`reading` (seen/unseen), `official` (confirmed/pending/none), `page`, `take`. Devolve cada item com
`origem_tipo`/`origem_descricao` sempre preenchidos (usa `ORIGIN_LABEL` de `src/lib/judicial/contracts.ts`), para
nunca deixar a IA confundir publicação do DJEN com intimação/citação com efeito de ciência.

### `caixa_v3_ver`

Teor completo de uma comunicação (id), com histórico interno e peça anexada, se houver. Consulta somente leitura:
não marca abertura interna nem ciência oficial (quem faz isso é a ação própria da tela, `markBoxV3NoticeViewed`,
nunca esta ferramenta).

### `caixa_v3_cobertura`

Matriz de cobertura e capacidades — mesmos dados da rota `GET /api/box/v3/capabilities` acima, com filtro
opcional por `conector`. Checa a permissão bruta `inbox:read` dentro do próprio `run()` (não delega a
`box-v3.service.ts` porque não usa nenhuma função de lá — lê direto `loadEvidence`/`coverageMatrix`/`CONNECTORS`).

## Ferramentas antigas que continuam bloqueadas (de propósito)

`listar_intimacoes`/`ver_intimacao` (mesmo arquivo) continuam fora do catálogo enquanto `BOX_AVAILABLE` for falso:
o nome bate no regex de `isBoxTool` E a permissão declarada é `"inbox:read"` (checada via `can()`/`assertCan()`,
que zera). Elas leem a Entrada antiga (`notice.service.ts`/`public-api.service.ts`), não a Entrada do Box 3.0 —
não foram tocadas nesta entrega, e não devem ser confundidas com as três ferramentas novas acima.

## Ferramenta de linha de comando: sonda do DJEN

`scripts/djen-probe.ts` / `scripts/server/djen-probe.py` (commit `7437a44`): sonda somente-leitura contra o DJEN
real, pensada para rodar de um servidor no Brasil (o DJEN recusa IP fora do Brasil). Não roda nestes ambientes de
desenvolvimento — ver `TESTING.md`.
