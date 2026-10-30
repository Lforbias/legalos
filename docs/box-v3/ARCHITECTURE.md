# LegalOS Box 3.0 — arquitetura

Este documento descreve a fundação do Box 3.0 entregue na branch `feature/box-3-foundation`. Para o estado funcional tela a tela, ver `docs/box-v3-reconstrucao.md`; para a auditoria do código antigo, `docs/box-v3-auditoria.md`.

## Decisão central: reaproveitar, não recriar

O Box 2.0 (retirado por `BOX_AVAILABLE=false`) já tinha construído, com qualidade, boa parte da "Camada C" que o prompt mestre pede:

- `src/lib/judicial/contracts.ts` — contrato de conector (`ConnectorDescriptor`, `Capability`, `OperationResult`, comunicação normalizada).
- `src/lib/judicial/catalog.ts` — catálogo de conectores (`CONNECTORS`) com capacidade declarada por operação.
- `src/lib/judicial/evidence.ts` — evidência de funcionamento, estado de homologação e matriz de cobertura (`coverageMatrix`).
- `src/server/judicial/evidence.service.ts` — persistência da evidência (`ConnectorEvidence`).
- `src/server/judicial/sync-engine.ts` — execuções com checkpoint, trava de concorrência e sinal de vida (`SyncRun`).

O Box 3.0 **não duplica nada disso**. `src/lib/box-v3/core/index.ts` é um barril que reexporta essas peças sob um nome estável (`@/lib/box-v3/core`), para o código novo importar de um único lugar, e acrescenta só a peça que faltava: uma classificação de erro comum (`classifyThrown`) para alimentar o orquestrador.

## O que é novo nesta entrega

### `src/server/judicial/orchestrator.ts` — `runCapability`

Um único ponto que executa uma chamada real de conector e grava a evidência correspondente (passou/falhou/inconclusivo), sempre, sem exceção manter a operação travada se a gravação falhar. Antes desta entrega, cada serviço (como `datajud.service.ts`) só gravava `AuditLog` (histórico de ação do usuário) — não `ConnectorEvidence` (prova técnica de funcionamento, que é o que alimenta `coverageMatrix`). Agora os dois existem lado a lado: auditoria de ação continua para o usuário, evidência técnica alimenta a matriz de cobertura do Box 3.0.

Contrato:

```
runCapability(
  { organizationId, connectorKey, operation, courtCode?, accessMethod, outcomeOf?, record? },
  () => <chamada real ao conector>
): Promise<T>  // devolve ou lança exatamente o que a chamada real devolveu/lançou
```

`outcomeOf` deixa cada conector decidir o que conta como "passou" fora do caminho de exceção (ex.: DataJud "processo não encontrado" é `INCONCLUSIVE`, não `FAILED` — não é uma falha do conector, é uma resposta válida).

### Desacoplamento do DataJud do Box retirado

`BOX_AVAILABLE=false` foi uma decisão de produto específica para o Box **autenticado** (PJe/eproc, certificados, sessões, protocolo) — tudo que deu problema na implementação anterior (login, certificados, sessões instáveis). O DataJud é uma fonte **pública**, sem autenticação de tribunal, sem certificado, sem sessão — não tem nenhuma relação com os problemas que motivaram a retirada do Box, e o próprio prompt mestre (§13) trata "Inteligência Judicial Pública" como uma fase independente da "Integração Autenticada".

Antes desta entrega, `datajud.service.ts` chamava `assertBoxAvailable()` em todas as funções (herdado de quando o Box 2.0 unificou tudo atrás de uma única chave), o que escondia inclusive o cartão de configuração em **Integrações** e o botão "Consultar DataJud" na página do processo — mesmo o escritório tendo uma chave própria configurada. Essa entrega remove essas chamadas (ver `git diff` em `src/server/services/datajud.service.ts`) e documenta a decisão no topo do arquivo. Nada do Box autenticado (PJe, eproc, certificados, MNI, sessões, peticionamento) foi tocado — continua exatamente como estava, atrás de `BOX_AVAILABLE`.

### Novo endpoint: `GET /api/box/v3/capabilities`

Cruza `CONNECTORS` (o que cada conector declara no código) com `coverageMatrix(loadEvidence(...))` (o que a evidência real recente prova), por tribunal e operação. Autenticado por sessão (`getTenant`), exige `inbox:read`, só responde com a prévia do Box 3.0 habilitada. Não inventa cobertura nacional: só mostra o que foi de fato registrado.

## Por que a tela de Monitoramento já mostra o DataJud sem eu ter mexido nela

`getBoxV3Monitoring` (em `src/server/judicial/box-v3.service.ts`, já existente) consulta `ConnectorEvidence` filtrando só por `organizationId`, sem filtrar por `connectorKey`. Como o `runCapability` novo grava evidência com `connectorKey: "datajud"` na mesma tabela, as verificações de DataJud aparecem automaticamente na tela "Verificações registradas" do Box 3.0 — nenhuma mudança de frontend foi necessária para isso. É um exemplo direto do princípio "código centralizado": um único lugar grava evidência, um único lugar já sabia mostrá-la.

## O que continua exatamente como estava (fora do escopo desta entrega)

PJe (portal e MNI), eproc, e-SAJ, PROJUDI, certificados A1/A3, sessões, DJEN (a ingestão para a caixa de entrada, não a consulta em si), peticionamento — tudo continua atrás de `BOX_AVAILABLE` ou da prévia `/box-v3` (leitura histórica), exatamente como documentado em `docs/box-v3-reconstrucao.md`. Esta entrega é a fundação (Camada C mínima real + um conector público ponta a ponta), não o projeto inteiro.
