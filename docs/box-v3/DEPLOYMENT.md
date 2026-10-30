# LegalOS Box 3.0 — implantação

> Cobre só o que muda na implantação por causa desta reconstrução do Box 3.0. O pipeline de deploy do produto
> inteiro (GitHub Actions, VPS, produção) não mudou — ver `docs/deploy-github.md`, `docs/deploy-vps.md` e
> `docs/producao.md`.

## Duas chaves diferentes, dois níveis de risco diferentes

- **`BOX_AVAILABLE`** (`src/lib/box-retirement.ts:5`): `export const BOX_AVAILABLE: boolean = false;` — uma
  CONSTANTE no código, não uma variável de ambiente. De propósito: reativar a Entrada autenticada antiga
  (PJe/MNI/certificado/protocolo) exige mudar uma linha de código, revisar e fazer um novo deploy — nunca um
  simples flip de variável de ambiente em produção, que poderia ser trocado por engano. Nenhuma mudança desta
  entrega altera esta constante.
- **`LEGALOS_BOX3_PREVIEW`** (`src/lib/box-v3-preview.ts`): variável de ambiente opcional (`"1"` liga; também
  liga sozinha com `NODE_ENV=development`). Controla só a prévia nova do Box 3.0 (telas `/box-v3/*` e a rota
  `GET /api/box/v3/capabilities`) — dados públicos (DJEN/DataJud) e leitura/tratamento interno da caixa, nunca
  sessão de tribunal nem protocolo de verdade. Pode ser ligada em produção sem religar nada do Box antigo.

## Banco de dados

Nenhuma migração nova nesta entrega. A tabela usada pela evidência (`connector_evidences`, modelo
`ConnectorEvidence`) já existe desde a migração `20270106000000_box_v2_foundation` — confirmado checando
`prisma/migrations/` diretamente. Todo o trabalho desta sessão (DJEN/DataJud desacoplados, caixa do Box 3.0,
ferramentas da RUTE, estado de sessão) usa modelos Prisma que já existiam (`CourtNotice`, `DjenMonitor`,
`CourtConnection`, `PortalAccess`, `ConnectorEvidence`); nada precisa de `prisma migrate deploy` além do que o
deploy já roda hoje.

## Variáveis de ambiente novas ou relevantes

| Variável | Obrigatória | Efeito |
|---|---|---|
| `LEGALOS_BOX3_PREVIEW` | não | liga as telas/rota da prévia do Box 3.0 fora do modo desenvolvimento |
| (nenhuma nova para DJEN/DataJud) | — | já cobertas pelas variáveis existentes do produto (ver `docs/producao.md`) |

## O que NÃO foi feito e bloqueia ir além da prévia

- Nenhuma credencial de tribunal real foi configurada ou testada nesta entrega — reativar qualquer conector
  autenticado exige autorização explícita da Dra. Talita e revisão de segurança própria (ver `SECURITY.md`,
  achado do 2FA automatizado).
- A sonda do DJEN (`scripts/djen-probe.ts`) não pode rodar destes ambientes: o DJEN recusa IP fora do Brasil.
  Rodar a partir de um servidor de produção no Brasil é o próximo passo antes de confiar na captura real.
- `feature/box-3-foundation` continua local; nenhum push ou PR foi feito para o repositório remoto
  (`Lforbias/legalos`) — aguardando autorização.

## Checklist de deploy desta entrega, quando autorizado

1. `npx tsc --noEmit` e `npx eslint` limpos (já verificado a cada commit; repetir após o merge).
2. Rodar a bateria de testes completa na máquina com Postgres de teste (ver `TESTING.md`) — ainda não feito.
3. Confirmar que `BOX_AVAILABLE` continua `false` depois do merge (não deve mudar nesta entrega).
4. Decidir, com a Dra. Talita, se `LEGALOS_BOX3_PREVIEW=1` entra em produção já (prévia, dados públicos) ou só em
   homologação.
5. Só depois disso, abrir PR para `Lforbias/legalos`.
