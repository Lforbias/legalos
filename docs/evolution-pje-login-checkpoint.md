# Evolution — piloto judicial TJMG

Checkpoint: 15/11/2026

## Escopo e estado

A Evolution foi limitada ao **TJMG**. O piloto de credenciais disponível no código é **TJMG · PJe · 1º grau** e permanece desligado por padrão, isolado do BOX antigo, que continua desativado. `EVOLUTION_PJE_LOGIN_ENABLED=1` habilita apenas o teste marcado da Evolution para o destino `tjmg-1g`, no servidor e no worker.

O TJMG está implantando eproc gradualmente e mantém processos legados no PJe. A Evolution agora oferece os dois testes de login separados: PJe pelo SSO PDPJ (`pje.tjmg.jus.br`) e eproc TJMG 1º grau (`eproc1g.tjmg.jus.br/eproc/`). O eproc exige TOTP, além de usuário/senha. O catálogo nacional continua preservado e o TJMG permanece `CATALOG_ONLY`; nenhum acesso foi marcado operacional. O adaptador MNI continua com endpoints nulos e não foi usado como prova de autenticação.

## Salvaguardas

- A tela e as ações da Evolution expõem somente TJMG · 1º grau, com destinos distintos para PJe e eproc; ações do servidor validam tribunal, grau, adaptador, origem e destino.
- O worker, quando o BOX está indisponível, reserva apenas `LOGIN_TEST` com origem específica para PJe (`EVOLUTION_TJMG_PJE_LOGIN`) ou eproc (`EVOLUTION_TJMG_EPROC_LOGIN`). Trabalhos antigos de TRF3 da Evolution não passam por essa trava.
- URL do portal é fixa no mapa do PJe. CPF/senha/segundo fator exigem MFA do LegalOS, são cifrados com a chave do cofre e não retornam à interface.
- CAPTCHA, bloqueio, ativação inicial do 2FA e telas desconhecidas interrompem o teste; não há bypass. O PJe usa TOTP quando o SSO solicita; o eproc exige chave TOTP cadastrada.
- Login não habilita consulta de autos, captura de publicações/movimentações ou peticionamento. BOX continua desligado.
- Registros anteriores não foram apagados; o painel da Evolution lista apenas o destino TJMG deste piloto.

## Arquivos alterados neste bloco

- `src/lib/evolution-judicial-login.ts`
- `src/lib/robots/pje/pje-adapter.ts`
- `src/lib/robots/eproc/login.ts`
- `src/modules/court-catalog/connect-adapter-actions.ts`
- `src/modules/court-catalog/connection-actions.ts`
- `src/modules/court-catalog/connect-form.tsx`
- `src/modules/court-catalog/connection-panel.tsx`
- `src/server/services/portal-access.service.ts`
- `src/server/robots/pje-runner.ts`
- `src/server/judicial/box-v3.service.ts`
- `src/tests/unit/adapter-registry.test.ts`
- `src/tests/unit/eproc-login.test.ts`
- `.env.example`

## Validação e pendências

- Typecheck, ESLint focado, `git diff --check` e testes de login simulado/targets aprovados; conferir quantidade final antes de publicar.
- Smoke test sem credenciais confirmou no portal real os campos PJe TJMG no SSO (`client_id=pje-tjmg-1g`) e o formulário próprio eproc (campo de usuário, botão e submissão via `Submit('login')`). Nenhum dado foi enviado.
- Login real com credencial autorizada ainda precisa ser executado pela pessoa no LegalOS depois da publicação; essa evidência é necessária antes de homologar.
- Não habilita consulta de autos, captura, protocolo, persistência de sessão ou unidades judiciais.
- Unidade judicial, sessão persistente, leitura de autos, captura e protocolo não fazem parte deste checkpoint.
