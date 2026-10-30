# LegalOS Box 3.0 — segurança

> Este arquivo documenta só as decisões e achados de segurança ESPECÍFICOS da reconstrução do Box 3.0. A base de
> segurança do produto inteiro (autenticação, MFA, cifra, LGPD, limite de taxa etc.) continua em `docs/security.md`
> e não foi alterada por esta entrega.

## Regras invioláveis do prompt mestre, verificadas nesta entrega

- **Nunca automatizar 2FA, assinatura, ciência oficial ou protocolo sem autorização explícita.** Verificado em
  todo o código tocado nesta entrega (`box-v3.service.ts`, `djen.service.ts`, `session-state.ts`, as três
  ferramentas novas da RUTE): nenhuma função marca ciência oficial, assina nada nem envia petição a um tribunal.
  `markBoxV3NoticeViewed` marca só a abertura INTERNA no LegalOS, nunca a ciência oficial (comentário explícito
  no próprio código: "Nunca altera a ciência oficial").
- **Nunca contornar captcha.** Não tocado nesta entrega; confirmado que o robô de portal (`pje-runner.ts`,
  `src/lib/robots/pje/login.ts`) já para e pede ação humana quando encontra captcha ou bloqueio — e continua
  retirado (`BOX_AVAILABLE=false`).
- **Nunca declarar homologado a partir de teste simulado.** `src/lib/judicial/evidence.ts`:
  `countsAsProof = (e) => e.environment !== "SIMULATED"` — evidência simulada nunca conta como prova, em nenhum
  lugar do código (orquestrador, matriz de cobertura, cartões de conexão).
- **Nunca gravar segredo em texto puro nem subir PFX pro git.** Não alterado nesta entrega; certificado e
  credencial de tribunal continuam no cofre (`sealBytes`/`openBytes`, `src/server/services/certificate.service.ts`)
  e seguem fora do controle de versão.
- **Nunca desligar verificação de TLS nem chamar WSDL/SOAP arbitrário.** Não alterado; `src/lib/mni/transport.ts`
  mantém verificação de TLS sempre ligada, bloqueio de redirecionamento, limite de 20MB de resposta e proteção
  contra SSRF (`isPrivateAddress`, `safeLookup` — nunca resolve nem chama endereço privado/local).
- **Isolamento multitenant.** Toda consulta nova em `box-v3.service.ts` é filtrada por `organizationId` e por
  `visibility(ctx)`/`caseVisibility(ctx)` (sigilo de processo); confirmado por auditoria de leitura de todo o
  arquivo (ver `REPOSITORY_AUDIT.md`) e pelos testes de integração novos.

## Modelo de permissão do Box 3.0 (por que não é `can()`/`assertCan()` direto)

`can(ctx, permissão)` e `assertCan(ctx, permissão)` (`src/server/context.ts`) zeram QUALQUER permissão que bata no
regex `isBoxPermission` (`/^(?:inbox|petitions|certificates):/`) enquanto `BOX_AVAILABLE` for falso — e
`BOX_AVAILABLE` é permanentemente falso (`src/lib/box-retirement.ts`). Isso é deliberado: é o que mantém a Entrada
autenticada antiga (PJe/MNI/certificado) bloqueada mesmo que alguém esqueça de apagar uma chamada.

O efeito colateral é que qualquer código NOVO do Box 3.0 que precise de `inbox:read`/`inbox:write` (que é
público, não depende de sessão de tribunal) fica inalcançável se usar `can()`/`assertCan()` para esse gate. Por
isso, em todo o Box 3.0, a autorização de verdade é a permissão BRUTA do cargo
(`ctx.permissions.has("inbox:read")`), nunca `can()`. Isto foi corrigido/aplicado em: `djen.service.ts`
(`syncDjen`), a rota `GET /api/box/v3/capabilities`, todo `box-v3.service.ts`
(`assertBoxV3Read`/`assertBoxV3Write`), e as três ferramentas novas da RUTE (que por isso declaram
`permission: "ai:use"` no catálogo, não `"inbox:read"` — ver comentário em `rute-tools.service.ts`). **Dois bugs
reais desse tipo foram encontrados e corrigidos durante esta entrega** (em `djen.service.ts` e na rota de
capabilities, que eu mesmo tinha escrito antes nesta mesma frente de trabalho) — ver `IMPLEMENTATION_STATUS.md` e
o commit `0b4fd8f`.

## Achado de segurança: 2FA automatizado no robô de portal (já retirado, não corrigido)

`src/lib/robots/pje/login.ts` (por volta das linhas 131–140) gera o código TOTP do segundo fator automaticamente a
partir de um `otpSecret` salvo (`totpCode(creds.otpSecret, step)`) e o preenche sozinho no formulário de login SSO
do PJe. Isto viola diretamente a regra do prompt mestre de nunca automatizar 2FA.

**Por que não foi corrigido agora**: o código já está atrás de `BOX_AVAILABLE=false` (retirado), então não há
violação ativa em produção hoje. Corrigir um fluxo de login que não roda, sem poder testar contra um login real,
criaria risco sem necessidade imediata.

**O que precisa acontecer antes de qualquer reativação futura do robô de portal**: redesenhar este trecho para
PARAR e pedir o código ao usuário humano (como já acontece com captcha e bloqueio de conta), nunca gerar o
segundo fator sozinho — mesmo que o segredo já esteja salvo no cofre. Ninguém deve reativar `pje-portal` sem
primeiro revisar e corrigir este arquivo.

## O que as ferramentas da RUTE expõem (e o que nunca expõem)

`caixa_v3_listar`/`caixa_v3_ver`/`caixa_v3_cobertura` (ver `API.md`) só leem o que `box-v3.service.ts` e
`src/lib/judicial/evidence.ts` já calculam — nunca abrem segredo, senha, certificado ou token; nunca criam uma
sessão de tribunal própria para a IA (nenhuma "conexão judicial exclusiva da IA", vedada pelo prompt mestre). Toda
resposta sai mascarada por `maskSensitive()` (CPF/CNPJ/e-mail) e prefixada com o aviso de que o conteúdo é DADO,
não instrução — o mesmo padrão já usado por todas as outras ferramentas de leitura do catálogo.
