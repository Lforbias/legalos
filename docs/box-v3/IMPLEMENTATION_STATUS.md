# LegalOS Box 3.0 — estado de implementação

> Instantâneo desta frente de trabalho (reconstrução do Box 3.0 pedida no prompt mestre). O estado do produto
> inteiro, fora do Box, continua em `docs/implementation-status.md`. Este arquivo nunca declara algo "pronto" só
> porque o código existe — a régua é sempre a evidência real gravada em `ConnectorEvidence` (ver
> `CONNECTOR_MATRIX.md` e `src/lib/judicial/evidence.ts`), nunca a presença de uma função ou de uma tela.

## O que está implementado e usável hoje (prévia)

- **DJEN e DataJud, desacoplados do Box autenticado retirado** (commits `be48e08`, `0b4fd8f`). Estas duas fontes
  são públicas (sem certificado, sem sessão de tribunal) e não dependem de `BOX_AVAILABLE`. `syncDjen`/
  `runDjenAll` (`src/server/services/djen.service.ts`) e o fluxo do DataJud continuam funcionando com a Entrada
  antiga retirada.
- **Orquestrador central de evidência** (`src/server/judicial/orchestrator.ts`, `runCapability`): único ponto que
  grava `ConnectorEvidence`; nenhum conector grava evidência por conta própria, e uma falha ao gravar nunca
  derruba a operação real.
- **Caixa de entrada do Box 3.0** (`src/server/judicial/box-v3.service.ts`, 37 funções exportadas): leitura e
  tratamento interno das comunicações (pastas entrada/abertas/acervo/adormecidas, nota, etiqueta, vínculo com
  processo/documento, distribuição para pessoa ou equipe, soneca) — tudo sobre o modelo `CourtNotice` já
  existente, sem reescrever o esquema. Nunca altera ciência oficial nem dispara nada no tribunal.
- **Fila de peticionamento em rascunho** (mesmo arquivo): criação, anexos, revisão, aprovação, devolução e
  cancelamento de minuta — sempre como rascunho interno. **Não protocola**: não há, nesta entrega, nenhum caminho
  de código que envie a petição para um tribunal de verdade.
- **Telas da prévia** (`src/app/(dashboard)/box-v3/*`): caixa, conexões, monitoramento, configurações,
  importações, peticionamento, sincronizações — atrás de `boxV3PreviewEnabled()` (dev ou `LEGALOS_BOX3_PREVIEW=1`).
- **Endpoint `GET /api/box/v3/capabilities`**: matriz de capacidades × cobertura real, por conector e tribunal.
- **Ferramentas da RUTE** (`caixa_v3_listar`, `caixa_v3_ver`, `caixa_v3_cobertura` — commit `9797a0e`): leitura
  somente, mesma base de dados e mesmas regras de visibilidade da tela.
- **Vocabulário único de estado de sessão/credencial** (`src/lib/judicial/session-state.ts`): não cria sessão nem
  abre segredo; só nomeia o que já existe em `CourtConnection`/`PortalAccess`.
- **Parâmetro `surface: "legacy" | "v3"`** em services pré-existentes (certificado, credencial de tribunal,
  triagem e guarda de intimação, notificação, petição, tarefa, prazo): permite ao código novo checar a permissão
  bruta do cargo em vez de `can()`, sem reescrever os serviços antigos.

## O que é só catálogo, ainda sem evidência real (não confundir com "funcionando")

Ver `CONNECTOR_MATRIX.md` para a tabela completa. Resumo por conector (`src/lib/judicial/catalog.ts`):

| Conector | Acesso | Autorização | O que o código já faz | Evidência real homologada |
|---|---|---|---|---|
| `djen` | público | não | descoberta automática, checagem, listagem de publicações | ainda não rodado contra o serviço real (bloqueio de IP fora do Brasil — ver `TESTING.md`) |
| `datajud` | API oficial, com chave | não | consulta de processo e movimentos públicos | depende de chave do DataJud configurada |
| `pje-mni` | SOAP (MNI 2.2.2) | sim | consultarProcesso, consultarAvisosPendentes, importação de autos, entregarManifestacaoProcessual | nenhum tribunal real homologado; só testado contra um tribunal simulado |
| `eproc-mni`, `esaj-mni`, `projudi-mni` | SOAP (MNI 2.2.2), onde o tribunal oferece | sim | subconjunto de `pje-mni` | nenhuma instância homologada |
| `pje-portal` | robô Playwright | sim | validação de login (CPF/senha/2FA) | **leitura de intimações do portal ainda não implementada**; achado de segurança em `SECURITY.md` |
| `esaj`, `projudi` (interface própria), `domicilio-judicial` | — | sim | sem conector | não implementado |

## Pendente (fora do escopo desta entrega, por decisão deliberada)

- Reativação de qualquer autenticação real (certificado, MNI, portal) — exige credencial real e autorização
  explícita da Dra. Talita; nada disso foi desbloqueado.
- A3/PJeOffice ("LegalOS Box Companion"): continua experimental, sem código novo.
- e-SAJ/PROJUDI além do que o MNI já cobre: pesquisado, não implementado — ver
  `ESAJ_PROJUDI_ESCOPO.md`. Achado principal: pelo menos dois tribunais (TJPB, TRT-SC) adotaram CAPTCHA em
  2026 justamente contra consulta pública automatizada, então um scraper próprio pararia (corretamente) no
  primeiro CAPTCHA; não há API pública oficial além de DataJud/DJEN; é decisão de produto da Dra. Talita,
  não pendência técnica.
- Rodar `scripts/djen-probe.ts`/`.py` contra o DJEN real a partir de um servidor no Brasil (o DJEN recusa IP fora
  do Brasil; nenhuma máquina usada nesta entrega está no Brasil).
- Bateria completa de testes automatizados (`vitest`) — ver `TESTING.md`: não roda nestes ambientes (binding
  nativo do rolldown ausente); fica para a máquina da Dra. Talita, por pedido dela, ao final do projeto.
- Push/PR para o repositório remoto — não autorizado ainda; tudo em `feature/box-3-foundation`, local.

## Verificação feita nesta entrega

Todo commit passou por `npx tsc --noEmit -p tsconfig.json` e `npx eslint` limpos antes de ser criado. Onde havia
teste de unidade sem dependência de rede/banco (ex.: `judicial-session-state.test.ts`), ele foi escrito e lido com
cuidado, mas **não executado** (vitest indisponível nestes ambientes) — a confirmação de que passa de verdade é
parte da bateria final combinada com a Dra. Talita. Ver `TESTING.md` para o detalhe completo.
