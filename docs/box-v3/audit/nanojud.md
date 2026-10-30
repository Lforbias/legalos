# nanojud — auditoria

Auditoria de leitura estática (nenhum código foi executado, nenhuma requisição feita). Citações: `arquivo:linha` dentro de `~/ext/nanojud`.

- **Licença verificada:** MIT, `LICENSE:1-3` (Copyright 2026 Luciano Molero). Reutilização permitida mantendo o aviso de copyright/licença.
- **Maturidade:** v0.5.3 (`pyproject.toml:7`), 1 commit visível (15/10/2026, `chore: preparar release 0.5.3`), ~8.090 linhas, 22 arquivos de teste (fixtures fakes; testes "live" opt-in em `tests/test_live_datajud_djen.py:8-12`). Em Python (LegalOS é TypeScript).

## O que o código realmente faz
Cliente leitor de três fontes públicas (eSAJ/TJSP por HTML, DataJud, DJEN), com timeline unificada (`timeline.py:13-33`), divergências entre fontes (`divergencias.py`) e servidor MCP somente leitura (`mcp_server.py:25-29`). Não loga credenciais (só método/URL, `client.py:49,52`).

## Contrato DataJud (como o código usa)
- `POST https://api-publica.datajud.cnj.jus.br/api_publica_{indice}/_search` (`datajud.py:21,129,145`).
- Cabeçalhos: `Authorization: APIKey <chave>`, `Content-Type`/`Accept: application/json` (`:135-139`). Chave = argumento > env > chave pública do CNJ embutida (`:23,101-108`). **O LegalOS deve ler a chave de env/segredo, nunca embutir.**
- Corpo: `{"query":{"match":{"numeroProcesso":"<20 dígitos>"}},"size":10,"_source":[numeroProcesso,classe,sistema,formato,tribunal,grau,dataAjuizamento,orgaoJulgador,assuntos,movimentos,partes]}` (`:25-39,130-134`). Sem `sort`, sem `search_after`, sem paginação.
- Índice por CNJ (`:72-87`): J=8 → tabela TR→`tjXX` (`:41-69`); J=4 → `trf{n}`; J=5 → `trt{n}`; J=2 → `stj`. **Bug provável:** J=2 é CNJ e STJ é J=3 (Res. CNJ 65/2008, conforme `maat/cnj.py:57-58,71`); TST, TSE, TREs, STM e TJMs não mapeados.
- Resposta lida: `hits.hits[]._source` (`:169`); por registro: `grau` (G1/JE/TR/G2/SUP, `:26`), `classe.nome`, `orgaoJulgador.nome`, `assuntos[]`, `dataAjuizamento`, `movimentos[]{codigo,nome,dataHora,complementosTabelados[].nome}`, `partes[]{nome,tipoParte,polo,advogados[]{nome,numeroOAB,ufOAB}}` (`:249-298`). Um registro por grau; menor grau define os dados principais (`:212-213`). `partes` só aparece em fixture; o README do maat afirma que o DataJud público não traz partes: validar em chamada real.
- Erros/limites: até 3 tentativas, backoff linear 1s/2s; retenta exceção de rede e HTTP 429 (`:143-155`); 401/403 → `AcessoRestrito` (`:157-158`); demais status, inclusive 5xx, falham sem retry (`:159`); timeout 30s; 200 sem hits → `nao_encontrado` (`:171-183`). Sem leitura de `Retry-After`.

## Contrato DJEN
- `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao` (`djen.py:15,103`), sem autenticação.
- Query: `numeroProcesso=<CNJ com máscara>`, `size=20`, `page=1..N`, opcional `dataInicio` (`:94-96`). **Os nomes `page/size/dataInicio` não foram confirmados em documentação; verificar o Swagger do DJEN antes de depender deles** (os nomes oficiais podem ser `pagina/itensPorPagina`).
- Resposta: lista de `items` (aceita também `content/comunicacoes/resultado`, `:34-42`). Campos: `id`, `data_disponibilizacao`, `siglaTribunal`, `tipoComunicacao`, `nomeOrgao`, `nomeClasse`, `texto`, `numeroprocessocommascara`, `numeroComunicacao`, `hash`, `status`, `ativo`, `data_cancelamento`, `motivo_cancelamento`, `destinatarios`, `destinatarioadvogados`, `link`, `meio` (`:51-75`).
- Paginação: máximo 50 páginas (`:17`), pausa 0,2s (`:143`); para quando página vazia, sem itens novos ou menos que `size` (`:128-141`). Dedupe por `id` (`:133-135`).
- Erros: 3 tentativas, só 429 retentado (`:112-114`); 403 → "pode haver bloqueio geográfico" (`:115-116`); outros status → indisponível. Timeout 30s.

## Conceitos aproveitáveis
CNJ: validação mod-97 (`utils.py:36-53`) e extração por regex (`normalization.py:16-36`); normalização de data (`normalization.py:39-62`); ID determinístico de evento `sha1(fonte|cnj|data|código|título)` com sufixo para repetidos (`timeline.py:36-44,163-165`); envelope por fonte com `source_status`, timeout global de 60s e falha isolada (`extraction.py:25,117-145`); allowlist de URL eSAJ (`esaj.py:106-113`); eSAJ para em captcha/senha, sem contorno (`esaj.py:238-241`).

## Riscos
Chave pública fixa no código (`datajud.py:23`); `api_key` aceita como argumento de ferramenta MCP (`mcp_server.py:94,114`); cache JSON em disco sem criptografia com dados de partes (`cache.py`, LGPD); mapeamento J=2 incorreto; DataJud sem paginação nem `Retry-After`; TLS sem `verify=False` (não encontrado).

## Decisão
**APENAS CONCEITO (reimplementar em TypeScript):** MIT permite, mas é Python; portar os contratos acima, corrigir J=3→STJ e validar parâmetros do DJEN; se algum trecho for portado, manter o aviso MIT.
