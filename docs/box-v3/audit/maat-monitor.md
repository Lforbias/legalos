# maat-monitor — auditoria

Auditoria de leitura estática (nada executado, nenhuma requisição feita). Citações dentro de `~/ext/maat-monitor`.

- **Licença verificada:** MIT, `LICENSE:1-3` (Copyright 2026 Márcio Luis Amorim). Reutilização permitida mantendo o aviso; cada módulo repete o copyright no cabeçalho.
- **Maturidade:** v1.0.0 (`pyproject.toml:3`), 1 commit visível (16/09/2026), ~4.680 linhas, 9 arquivos de teste (~129 testes, isolados com `MAAT_HOME` temporário, `tests/conftest.py:6-10`). Python, SQLite local, painel web em `127.0.0.1` (`painel.py:2-6`).

## O que o código realmente faz
Lê uma lista local de CNJs, consulta o DataJud um a um (pausa padrão 1,5s, `config.py:109`; `cli.py:254`), grava estado em SQLite e avisa por e-mail/WhatsApp quando surgem movimentos que ainda não estavam no banco. Não usa DJEN nem raspa portais (`descoberta_oab.py:7` só gera guia para o usuário resolver CAPTCHA manualmente).

## Contrato DataJud (como o código usa)
- `POST https://api-publica.datajud.cnj.jus.br/{alias}/_search`, alias `api_publica_<código>` (`constantes.py:13,44`; `datajud.py:97`). Autorização `APIKey <chave pública>` (`datajud.py:98-101`, chave embutida em `constantes.py:18`).
- Corpo: `{"query":{"match":{"numeroProcesso":"<20 dígitos>"}},"size":1}` (`datajud.py:102`). **Só o primeiro hit: processos com vários graus perdem os demais** (nanojud usa `size` 10).
- Validação da resposta: `hits.hits[0]._source` precisa ser dict e o `numeroProcesso` retornado precisa igualar o consultado, senão erro "divergente" (`datajud.py:71-88`).
- Catálogo de índices correto e mais completo que o do nanojud: stf, stj, tst, tse, stm, `trf1-6`, `trt1-24`, `tjXX`, `tre-XX`, `tjmmg/rs/sp` (`constantes.py:46-65`); J=3→STJ, J=2 não consultável (`cnj.py:47-73`).
- Campos persistidos: `classe.nome`, `orgaoJulgador.nome`, `assuntos[].nome`, `grau`, `tribunal`, `dataAjuizamento`, `dataHoraUltimaAtualizacao`, `valorCausa`, `movimentos[]{dataHora,codigo,nome,complementosTabelados[].nome}` (`banco.py:137-149,195-203`).
- Erros: sem retry (um único POST); SSL, timeout, HTTP (dica para 429 e 5xx), conexão e JSON inválido viram mensagem em português, nunca exceção (`datajud.py:104-119`). TLS sempre verificado; usa `truststore` do sistema (`datajud.py:20-25`).

## Detecção de movimentos novos (conceito central)
- Esquema SQLite (`banco.py:36-81`): `processos` (CNJ PK, metadados, `json_completo`, `primeiro_check`, `ultimo_check`), `movimentos` (`UNIQUE(cnj,data_hora,codigo,nome)`, `detectado_em`, `novo`), `execucoes` (totais por rodada).
- Fluxo: valida estrutura inteira antes de escrever (`banco.py:108-122,134`); se já havia `json_completo`, a rodada é de comparação (`:159,194`); insere só movimentos cuja chave `(cnj,data_hora,codigo,nome)` ainda não existe, com `COALESCE` para NULLs (`:205-217`); conta `rowcount` como novos. A primeira carga é linha de base e não gera alerta (`marcar_novo=0`).
- Fonte indisponível: não grava nada, conta como erro e segue (`cli.py:231-235`); nunca apaga movimentos já gravados. Falta: o e-mail só mostra a contagem de erros (`notificacoes.py:115-116`), sem alarme de "processo sem monitoramento", e `novo` nunca é zerado (não encontrado no código).
- Backup SQLite online com retenção de 10 (`banco.py:320-338`).

## O que NÃO substitui comunicação oficial
O próprio README.pt-BR (`:56`) afirma que não substitui PJe Push, Diário Oficial nem intimação eletrônica para prazo fatal; DataJud tem defasagem e não mostra segredo de justiça (`:60`). `calcular_prazo` estima em dias corridos por palavra-chave (`constantes.py:111-121`; `analise.py:64-73`), o que contraria o CPC (dias úteis): **não reaproveitar**.

## Conceitos aproveitáveis
Chave natural de dedupe de movimento (`banco.py:68`); validação estrutural antes de persistir (`banco.py:108-122`); checagem cruzada do CNJ devolvido (`datajud.py:86`); catálogo J/TR→índice (`cnj.py:47-73`); mod-97 (`cnj.py:37-44`); e-mail com `html.escape` (`notificacoes.py:106-130`).

## Riscos
Chave pública embutida; `size:1`; chave de dedupe ignora `complemento` (dois eventos distintos no mesmo instante/código/nome colapsam); WhatsApp via CallMeBot, terceiro que recebe rótulos de processos e token na query string (`notificacoes.py:87-90`, LGPD/sigilo); classificação por palavra-chave (`constantes.py:76-108`) gera falso alerta/ausência.

## Decisão
**APENAS CONCEITO (reimplementar):** MIT permite reuso, mas a arquitetura (SQLite local, CLI) não serve ao SaaS; adotar o modelo de estado/dedupe e o catálogo de índices, não o estimador de prazo.
