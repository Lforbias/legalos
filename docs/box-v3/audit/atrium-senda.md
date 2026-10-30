# Atrium-Senda — auditoria

Auditoria somente leitura (nada foi executado nem instalado). Data: 2026-10-29. Clone em `$HOME/ext/Atrium-Senda`.

## Licença e maturidade
- **Licença verificada:** MIT (`LICENSE:1-3`, "Copyright (c) 2026 Atrium Senda Contributors"; `package.json:7`). Reuso de código permitido mantendo aviso de copyright e texto MIT. Proveniência: User-Agent legado "Keller-Central-Juridica" (`collector/adapters/datajud.mjs:102,120`) e alias de marcas antigas (`AGENTS.md:1-12`) indicam código herdado de outro produto; a titularidade não é verificável só pelo repositório.
- **Maturidade:** 530 arquivos, histórico de 1 commit (2026-09-11), versão 2.1.1 (`package.json:3`). 198 entradas em `tests/` (scripts Node) e CI em `.github/workflows/ci.yml`. Os testes judiciais usam páginas e fetch sintéticos (`tests/eproc_a1_totp_integration.mjs:41`); `docs/judicial/MANAGED_CONNECTIVITY.md` admite que o CI não toca portal autenticado e que PJe/eproc/e-SAJ ficam `not_verified` sem evidência.

## O que o código realmente faz
- **DJEN:** consulta por OAB, host fixo oficial (`djen.mjs:15-18`), páginas de 50, até 200 páginas, backoff em 429 e espaçamento de 400 ms (`djen.mjs:34-104`).
- **DataJud:** POST `_search` por alias do tribunal derivado do CNJ J.TR (`datajud.mjs:489-503`), `redirect:'error'` (`:105,120`), chave pública do CNJ embutida (`:2`) e renovada por scraping só da wiki oficial (`:117-128`). Defeito: o `|| OFFICIAL_DEFAULT_KEY` (`:20`) torna o teste `!apiKey` (`:28`) sempre falso; a renovação só ocorre em 401/403 (`:54-58`).
- **PJe (`pje.mjs`):** Playwright lê linhas de tabela (`:82-89`). Guarda read-only por regex sobre rótulos de aba (`:3,92,104`) e allowlist de origem https/.jus.br (`:113-120`). Não toma ciência (`:60`).
- **eproc TJRS (`eproc.mjs`):** login A1+Keycloak+TOTP (`:12-79`), painel de prazos e intimações pendentes (`:282-308`), extração da "chave do processo" por clique (`:462`), download de peças e índice (`:773-947`). URL do TJRS fixa (`:13,133`; `agent.mjs:123`).
- **Cofre:** AES-256-GCM com chave de 32 bytes vinda de env (`security.mjs:39,1144-1157`), envelope 0600 (`credential-manager.mjs:43-52`), PFX em `secrets/` 0600 (`:97-98`), passphrase e sementes TOTP no mesmo blob (`:115-120,152-160`). A doc diz "derivado por Scrypt" (`AUTH_ARCHITECTURE.md:33`); no código scrypt só faz hash de senha (`security.mjs:1241`).
- **Omni (`lib/judicial/omni`):** validador CNJ com dígito verificador (`contracts.mjs:56-62`), classes de fato FACT/INFERRED/UNVERIFIED (`:8-12`), fingerprint SHA-256 canônico (`fingerprint.mjs:12-70`), diff de movimentos em 4 vias (`diff-engine.mjs:17-70`), fila por prioridade P0-P4 com backoff (`queue.mjs:11-81`).

## Real versus apenas documentado
- **Real (com teste sintético):** DJEN, DataJud, cofre, sandbox A1, TOTP, máquina de estados de sessão, normalização/diff.
- **Só documentado ou não evidenciado:** PJe autenticado, eproc fora do TJRS, "integração" PJeOffice (só um GET de saúde em 127.0.0.1:8800, `auth-adapters.mjs:114-133`), Windows Store (cai no adapter manual, `:224-228`). **A3 (token/smartcard): não implementado**; o único caminho é o app PJeOffice externo. `portalVerificationState` marca DJEN/DataJud como `verified` sem evidência (`managed-connectivity.mjs:65`).

## Conceitos aproveitáveis
1. Contrato de portal e estados (`managed-connectivity.mjs:13-35`; `session-manager.mjs:5-14`).
2. Estratégias de autenticação como adaptadores (`auth-adapters.mjs:3-27,213-232`).
3. Cadência 30 min, backoff 15 min a 6 h e pausa em ação humana (`managed-connectivity.mjs:33-35,70-83`; `agent.mjs:73-76`).
4. Proveniência de dados, fingerprint e diff (arquivos omni acima).
5. Sanitização de erros e visão pública sem segredos (`managed-connectivity.mjs:42-49`; `credential-manager.mjs:199-231`).
6. Política declarativa de operações proibidas (`managed-connectivity.mjs:22-30`; `orchestrator.mjs:129`).
7. Sandbox A1 em loopback com egress bloqueado (`a1-sandbox.mjs:543-554`), senha do PFX por variável de ambiente e não por argv (`:143-152`).
8. Perfil Chromium isolado por usuário+identidade+portal (`session-manager.mjs:36-47`).

## Riscos de segurança e qualidade
- **2º fator automatizado:** a semente TOTP é guardada e o código injetado sem humano (`auth-adapters.mjs:66-77,173-177`; `eproc.mjs:34-45`; `credential-manager.mjs:160`). É contorno de MFA por desenho. Para o LegalOS exige consentimento expresso do titular e deve ser vedado para certificado de terceiros.
- **CAPTCHA:** não há contorno; detecta e para (`auth-adapters.mjs:155-162`; `tjsp-adapter.mjs:81`; `tjrs-adapter.mjs:119-131`). O comentário "Altcha PoW simulation" (`tjrs-adapter.mjs:5`) não tem implementação.
- **TLS:** `rejectUnauthorized:false` (`a1-sandbox.mjs:510`) e `ignoreHTTPSErrors:true` (`:534`) só no teste loopback; sem TLS desabilitado em produção.
- **Sucesso simulado em caminho de produção:** `tjsp-adapter.mjs:96-110` aceita qualquer JSON com `cnj`/`metadata` como processo real ("modo de teste offline").
- **Log de segredo:** `eproc.mjs:259` imprime o `hash` de sessão do eproc.
- **Ciência/protocolo:** a guarda é só regex de rótulo e doc; `openEprocProcessDetails` não bloqueia abrir evento de intimação. Verificar por tribunal se abrir consome prazo.
- **Concorrência:** lock e fila em memória (`session-manager.mjs:53-60`; `queue.mjs:16,47` serializa todos os tribunais, ao contrário da doc); `catch {}` em excesso (`session-manager.mjs:33,194`); `readRawSecrets` lê arquivo fora do diretório de dados (`credential-manager.mjs:25`).

## Decisão
**REUTILIZAR CÓDIGO (parcial, MIT com aviso no cabeçalho)** apenas dos módulos puros: `contracts.mjs`, `fingerprint.mjs`, `diff-engine.mjs`, `sanitizeJudicialError` e a lógica de cadência, portando para TypeScript. **APENAS CONCEITO** para coletores DJEN/DataJud (reescrever com chave configurável e sem UA legado). **DESCARTAR** o scraping PJe/eproc, o TOTP automático e a lógica de PJeOffice.
