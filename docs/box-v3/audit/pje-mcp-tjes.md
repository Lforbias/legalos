# Pje-MCP- (TJES PJE MCP + DataJud MCP) — auditoria

Somente leitura, nada executado. 2026-10-29. Clone em `$HOME/ext/Pje-MCP-`.

- **Licença verificada:** MIT (`LICENSE:1-3`, "Copyright (c) 2025 TJES PJE MCP Server Contributors"). Reuso permitido mantendo o aviso.
- **Maturidade:** 1 commit (2025-11-16), 33 arquivos, cerca de 3,7 mil linhas Python. Só 13 funções de teste (DataJud e sessão); nenhuma para `cert_manager.py` ou `server.py`. `STATUS.md:275-278,314-315` admite que os endpoints do PJe "precisam ser validados" e que nunca foi testado com certificado real, embora o mesmo arquivo declare "FUNCIONAL" e "COMPLETO".

## O que o código realmente faz
- **A1:** carrega PKCS#12 com `cryptography` (`cert_manager.py:138-142`), valida vigência (`:154-164`) e mapeia erro de senha. Exporta a chave privada em PEM sem criptografia (`:157-161`) para arquivos temporários (`:183-193`), apagados só no `finally` de saída normal (`server.py:951-955`); em queda do processo a chave fica em disco.
- **A3: não implementado.** Lê apenas o certificado público do Windows Store, pega o primeiro que encontrar, busca por thumbprint levanta `NotImplementedError` e `private_key` fica `None` (`cert_manager.py:218-225,245`). Em `server.py:252-255` o A3 vira requisição SEM certificado, com aviso de "suporte limitado". Sem PKCS#11, sem assinatura de handshake.
- **"Safe ID":** `pje_authenticate_safe_id` só grava um JSON de metadados e devolve instruções (`server.py:790-860`). "Sessão válida" significa existir metadado com menos de 8 h (`session_manager.py:154-165`); não verifica login real nem guarda cookies. Os trechos de Playwright são textos de instrução (`:289-412`), não código executável.
- **PJe REST:** httpx com `cert=(cert,chave)` e `verify=True` (`server.py:257-262`), mas os caminhos `/api/v1/processos/...` são suposições ("ajustar conforme API real", `:416-417`).
- **DataJud MCP:** POST `_search` com `Authorization: APIKey` (`datajud_mcp/server.py:198-215`); valida 20 dígitos sem dígito verificador (`:78-106`). Variáveis de rate limit e cache do `.env.example` não têm uso no código (não encontrado).

## Capacidades reais versus documentadas
Real: A1 por arquivo (carga e validação), consulta DataJud. Documentado sem lastro: A3, Safe ID, as 7 consultas PJe REST, rate limit e cache.

## Conceitos aproveitáveis
1. Painel de saúde do A1: dias para expirar, alerta aos 30 dias, hierarquia de erros por causa (`cert_manager.py:37-69,266-289`).
2. Expor consulta judicial ao agente como ferramentas MCP somente leitura (nenhuma ferramenta protocola ou assina).
3. Retry exponencial (tenacity) que repete 5xx e timeout e não repete 4xx (`server.py:209-212,286-295`).

## Riscos de segurança e qualidade
- `numero_processo` é concatenado no caminho sem validar, com `follow_redirects=True` (`server.py:417,531,576`).
- Corpo completo de erro HTTP no log (`server.py:287`): risco LGPD.
- `datajud_advanced_search` repassa query Elasticsearch arbitrária (`datajud_mcp/server.py:446-503`).
- Chave pública do CNJ nas configs e README (`.env.example:15`) e caminho pessoal real em `.env.example:42`.
- Sem `verify=False`, sem parser XML próprio, sem CAPTCHA/MFA contornado, sem ciência ou protocolo automáticos.

## Decisão
**APENAS CONCEITO (reimplementar em TypeScript):** MIT permitiria reuso, mas o único trecho real é a validação de A1, trivial; A3 e Safe ID são só aparência e o PJe REST nunca foi validado.
