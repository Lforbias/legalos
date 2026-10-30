# pje-download — auditoria

Somente leitura, nada executado. 2026-10-29. Repositório SEM licença: só ideias e arquitetura, nenhum código reproduzido.

- **Licença verificada:** nenhum `LICENSE`/`COPYING` na raiz; `README.md`, `CLAUDE.md` e `AGENTS.md` não citam licença. Todos os direitos reservados: proibido copiar, adaptar ou redistribuir.
- **Maturidade:** último commit 2026-10-24 (histórico de 1 commit); cerca de 10 mil linhas Python (`worker.py` 2651, `dashboard_api.py` 1921, `mni_client.py` 1181); 55 arquivos e 977 funções de teste; CI e deploy. `CLAUDE.md:51` diz 1275 testes passando (não reproduzido). Piloto autenticado "não realizado" (`docs/testing/2026-10-18-tjes-1g-piloto.md:3`); evidência operacional só do TJES.

## O que o código realmente faz
- MNI SOAP por CPF e senha via zeep (`mni_client.py:486-494`), tribunais TJES, TJBA, TJCE e TRT17 (`:52-57`); cascata MNI, API REST, navegador.
- Download em duas fases, metadados e depois conteúdo por IDs (`mni_client.py:476-485`; `worker.py:1157-1245`).
- Taxonomia de resultado: success, not_found, auth_failed, blocked, mni_error, parse_error, timeout (`mni_client.py:313-440`); 403 puro tratado como geobloqueio e não como senha errada (`:420-440`).
- Validação antes de gravar: base64 estrito, rejeição de HTML de login, PDF com `%PDF-` e `%%EOF`, escrita atômica (`document_validation.py:16-22,46-93`); dedup SHA-256 (`mni_client.py:962-995`).
- Fila Redis confiável com BLMOVE, ack, reentrega limitada e dead-letter (`worker.py:2184-2282,2312`); circuit breaker (`:2326-2336`); auditoria JSONL CNJ 615/2025 (`audit.py:1-55`).
- Coleta restrita fail-closed: só IDs pedidos, sem fallback integral (`worker.py:864-930`).
- Login interativo visível: a pessoa resolve CAPTCHA e MFA; estado salvo 0600 (`pje_session.py:6-8,100-117`). CAPTCHA detectado por substring e o job para; nenhum solver no código (`worker.py:188-195,527-551`).

## Real versus documentado
Real: MNI por senha, fila, validação, auditoria. **A1, A3 e mTLS: não encontrado no código.** REST e navegador dependem de sessão humana e seletores frágeis.

## Conceitos aproveitáveis (reimplementar)
1. Cascata de estratégias com status por tentativa e coleta restrita (menor acesso, LGPD).
2. Taxonomia de erro que separa credencial, bloqueio de rede, esquema e inexistência.
3. Validação de conteúdo com limite declarado (`document_validation.py:49-53`).
4. Fila com processing queue, ack, reentrega limitada, mensagens tipadas (`protocol.py:25-60`).
5. Hardening de WSDL com `forbid_external` (`mni_client.py:228-229`; `config.py:160-163`) e allowlist exata de host (`gdrive_downloader.py:93-121`).

## Riscos
- Senha Redis padrão `pje_redis_2026` (`docker-compose.yml:34,41,70,130`).
- Proxy "para contornar bloqueio de IP do tribunal" (`.env.example:15`): risco jurídico, não adotar.
- Caminho REST grava sem validar (`pje_session.py:274`); job descartado sem dead-letter em exceção imprevista (`worker.py:2405`); resposta SOAP bruta retida (`MNIResult.raw_response`), risco LGPD em log.
- TLS e XML: sem `verify=False` nem parser permissivo; `audit_sync.py:346` só relaxa hostname em Postgres.

## Decisão
**APENAS CONCEITO (reimplementar):** sem licença não há reuso de código; o valor é arquitetura de fila, validação e erros do MNI.
