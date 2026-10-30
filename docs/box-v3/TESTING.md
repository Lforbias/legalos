# LegalOS Box 3.0 — testes

> Cobre só a estratégia de teste desta reconstrução do Box 3.0. A estratégia de teste do produto inteiro (Vitest
> unitário/integração, Playwright e2e) não mudou e não está repetida aqui.

## Por que eu não executei a bateria completa

Dois ambientes diferentes foram usados nesta sessão para editar código — o workspace na nuvem e a VM Linux do Mac
da Dra. Talita, alcançada pela ponte de dispositivo — e o Vitest falha em AMBOS com o mesmo erro:

```
Cannot find module '@rolldown/binding-wasm32-wasi'
```

(bug conhecido de dependência opcional do npm — https://github.com/npm/cli/issues/4828). Ou seja, mesmo editando os
arquivos diretamente no ambiente ligado à máquina dela, não dá pra garantir que esse binding nativo específico (ou
um Postgres de teste acessível) existe no ambiente de desenvolvimento real dela fora dessa ponte. Por isso, e por
pedido explícito dela ("eu não vou fazer teste nenhum... quando tiver o projeto todo... aí sim podemos fazer todos
os testes"), a bateria completa (`vitest`/Playwright) fica para quando ela rodar na própria máquina, ao final do
projeto.

## O que eu verifiquei, mesmo assim, a cada mudança

Todo commit desta entrega passou por `npx tsc --noEmit -p tsconfig.json` e `npx eslint <arquivos mudados>` limpos
antes de existir. Isso pega erro de tipo, import quebrado, propriedade inexistente e problema de estilo — mas
**não** pega erro de lógica em tempo de execução, nem resultado errado de uma consulta ao banco. Onde dava para
checar a lógica só lendo (regex do `isBoxTool`, por exemplo), eu rodei um `node -e` isolado para confirmar — ver o
commit `9797a0e`.

## Testes novos ou alterados nesta entrega

| Arquivo | Tipo | Cobre |
|---|---|---|
| `src/tests/unit/judicial-session-state.test.ts` | unitário, puro | `courtConnectionSessionState`/`portalAccessSessionState` |
| `src/tests/unit/box-v3-notice-access.test.ts` | unitário, com mock de banco | `assertNoticeUsable` (vínculo v3 vs. legado) |
| `src/tests/unit/box-v3-orchestrator.test.ts` | unitário | `runCapability` (gravação de evidência, nunca derruba a operação real) |
| `src/tests/unit/box-retirement.test.ts` | unitário | DJEN/DataJud independentes de `BOX_AVAILABLE`; demais conectores continuam bloqueados |
| `src/tests/integration/box-retirement.test.ts` | integração, banco real | mesma garantia acima, sem mock de `can()` |
| `src/tests/integration/rute-box-v3-tools.test.ts` | integração, banco real | as três ferramentas novas da RUTE (catálogo, listar, ver, cobertura, e a negativa de permissão) |

Não escrito nesta entrega, e ainda faltando: nenhum teste roda de fato a sonda do DJEN contra o serviço real, nem
existe teste e2e (Playwright) das telas `src/app/(dashboard)/box-v3/*` (todo o `src/tests/e2e/box-v2-*` continua
cobrindo só a Entrada antiga). Ambos ficam como pendência explícita, não como "não precisa".

## Quando a Dra. Talita for rodar a bateria completa

Comandos sugeridos, na máquina dela, com Postgres de teste disponível:

```bash
npx vitest run src/tests/unit
npx vitest run src/tests/integration
npx playwright test src/tests/e2e/box-v2-off.spec.ts src/tests/e2e/box-func.spec.ts  # confirma que a Entrada antiga continua retirada
LEGALOS_BOX3_PREVIEW=1 npm run dev   # para abrir /box-v3/* manualmente e conferir as telas
```

Nenhum destes comandos precisa de credencial de tribunal nem de rede liberada para fora do Brasil — exceto a
sonda do DJEN (`scripts/djen-probe.ts`), que só faz sentido com um servidor no Brasil.
