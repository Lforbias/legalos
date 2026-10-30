# extensao-eproc — auditoria

Leitura estática; nada executado. Citações em `~/ext2/extensao-eproc`. AGPLv3: **referência funcional apenas**; nenhum código reproduzido nem portado.

- **Licença verificada:** `LICENSE:1-2` (GNU Affero General Public License v3, texto-padrão de 661 linhas); `README.md:125-127` confirma AGPLv3; `package.json` sem campo de licença.
- **Maturidade:** extensão de navegador "Eproc Pasta Digital" v1.0/1.0.1 (`manifest.json`), 1 commit visível (29/05/2026, "fix firefox"), ~1.900 linhas JS/HTML/CSS, **sem testes**. Manifest V3, permissões `storage` e `windows`, hosts de ~25 instâncias eproc (TJs e TRFs).

## O que o código realmente faz
Roda no navegador do advogado, já autenticado, na página `acao=processo_selecionar` do eproc (`manifest.json`, `content_scripts`); injeta botão "Pasta Digital" (`content.js:8-29`), lê os eventos do DOM da página atual, busca as demais páginas da paginação e abre uma janela com a linha do tempo. Não há servidor, credencial, certificado, peticionamento nem ciência (não encontrado no código).

## Ideias funcionais observadas (descrição, não código)
- Eventos nas tabelas `#tblEventosNovos`/`#tblEventos`, linhas `tr[id^=trEvento]`, com data/hora, descrição, usuário e links de documento (`parser.js:58-72,185-199`); "Teor do ato" separa título de corpo (`parser.js:95-114`); advogados e OAB por padrão textual (`parser.js:116-142`); metadados de prazo e abertura de intimação vêm de tooltips (`parser.js:9-45,165-183`).
- Paginação: o seletor `selPaginacaoR` lista as páginas; cada página restante é pedida por POST à ação `processo_selecionar_pagina` com `num_processo` e o `hash` da URL da sessão, em paralelo (`api.js:4-68`); o HTML devolvido passa pelo mesmo parser (`api.js:65-68`).
- Ordenação cronológica: junta página atual e demais, deduplica pelo id da linha e ordena por data/hora `dd/mm/aaaa hh:mm:ss` (`content.js:50-61`, `utils.js:8-21`).

## Capacidades reais vs. documentadas
Reais: reorganizar visualmente, no cliente, uma pasta já acessível ao usuário. Dependente de seletores HTML do eproc (frágil a mudança de layout).

## Obrigações da AGPLv3 (por que não incorporar)
Qualquer obra derivada (copiar, traduzir para TypeScript ou adaptar trechos) tem de ser licenciada integralmente sob AGPLv3 e manter avisos de copyright; a cláusula de rede (§13) obriga a oferecer o código-fonte completo correspondente a quem usar a versão modificada remotamente, o que atingiria o SaaS proprietário inteiro; vale também a licença de patentes. **Não incorporar nenhum código; reimplementar apenas a ideia a partir de especificação própria.**

## Riscos
Nenhuma função de escape de HTML: texto dos eventos vai para um `data:text/html` (`formatter.js:227,297-308`); eventos guardados em `chrome.storage.local` sem expiração (`content.js:66`), dados pessoais em claro no navegador; depende de `hash` de sessão na URL; sem testes.

## Decisão
**APENAS CONCEITO (reimplementar):** AGPLv3 impede reuso em produto proprietário; aproveitar só a ideia de paginar por ação do tribunal, deduplicar por id e ordenar cronologicamente, escrita do zero.
