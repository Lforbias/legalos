# movimentacoes_processuais — auditoria

Leitura estática; nada executado. Citações em `~/ext2/movimentacoes_processuais`. SEM licença: só ideias, nenhum código reproduzido.

- **Licença verificada:** nenhum `LICENSE`/`COPYING`; README sem cláusula de licença. Todos os direitos reservados.
- **Maturidade:** 1 commit visível (16/11/2022, "Update README.md"), desatualizado há ~4 anos; ~735 linhas Python (Selenium + pandas + MySQL), **sem testes**. Seletores HTML de 2021-2022 provavelmente quebrados.

## O que o código realmente faz
Bot Selenium/Chrome que, para cada CNJ de uma planilha XLSX do dia ou de tabela MySQL (`main.py:15-20`), abre a consulta pública PJe do tribunal estadual (código J.TR extraído de `numero_processo[16:20]`, `main.py:25`; mapa em `data/portais.xml`, só 11 TJs: BA, DF, ES, MA, MG, MT, PB, PE, PI, RN, RO), digita o número, abre a aba do processo e lê os spans de movimentos (`bot_pje.py:40-48,95-108`), gravando data e texto em planilha/banco (`main.py:32-33`). Rendimento declarado de 15 a 20 consultas por minuto (README).

## Capacidades reais vs. documentadas
Reais: leitura de movimentos da consulta pública sem login, apenas onde não há CAPTCHA. Documentadas e não confirmadas: "adaptação à instabilidade" (na prática, laços `while True` com `except: continue` sem limite, `bot_pje.py:22-48,52-65,69-88`); "verificação de duplicidade" (apenas por processo+data, descarta movimentos distintos no mesmo dia, `base/database.py:57-60`).

## CAPTCHA
Não há solução de CAPTCHA no código executável. Há, porém, indício de gancho para serviço de resolução: `cap_monster = key` em `config/config.ini:4` e atributo `sitekey` (vazio em todos os portais) carregado em `base/portais.py:32`; nenhum uso adicional encontrado. Registrar como risco e não reproduzir.

## Conceitos aproveitáveis
Apenas a ideia de catálogo por tribunal derivado do campo J.TR do CNJ, com URL de consulta e seletor por portal em arquivo de configuração (`data/portais.xml`, `base/portais.py:20-34`), e de lista de processos "a atualizar hoje" (`database.py:43-48`). Nada que o LegalOS já não obtenha melhor via DataJud/DJEN.

## Riscos
- Injeção de SQL: valores raspados do portal e o número do processo entram por f-string em `INSERT/SELECT` (`database.py:45,52,57,60,61`).
- TLS desligado no Chrome: `--ignore-certificate-errors` e `--ignore-ssl-errors` (`base/automacao.py:44-45`).
- Credenciais de banco em arquivo de configuração versionado (`config.ini:9-14`, senha trivial) e `--no-sandbox` (`automacao.py:47`).
- Retorna o objeto de exceção como se fosse resultado (`bot_pje.py:106-108`) e imprime consultas completas em log (`database.py:68`).
- Raspagem de portal público em volume, sem tratamento de bloqueio, CAPTCHA ou limites.

## Decisão
**DESCARTAR:** sem licença, abandonado desde 2022, TLS desabilitado, SQL injetável e valor nulo sobre DataJud/DJEN.
