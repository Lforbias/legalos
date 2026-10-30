# vinea — auditoria

Leitura estática; nada executado. Citações em `~/ext/vinea`. Regra do projeto: SEM licença, logo só ideias/arquitetura, nenhum código reproduzido.

- **Licença verificada:** nenhum `LICENSE`/`COPYING` no repositório; `README.md:262-264` diz "[Adicionar licença conforme necessário]". Sem licença = todos os direitos reservados: não copiar, nem adaptar, nem redistribuir.
- **Maturidade:** v0.18.2 (commit de 29/10/2026), 1 commit visível, ~8.100 linhas, 5 arquivos de teste (24 testes, sem rede). Aparenta uso do Ministério Público (conta de consulta "_MP", modelos de MPU e ato infracional, Fabric/Spark).

## O que o código realmente faz
- Cliente SOAP MNI 2.2.2 com `zeep` e só a operação `consultarProcesso` (cabeçalho, movimentos, documentos): `consulta.py:273-297`. WSDLs fixos de e-SAJ, eproc 1G 2.2/3.0 e eproc 2G (`consulta.py:103-108`); o do e-SAJ é `http://` sem TLS (`:104`).
- Credencial MNI: `idConsultante` + `senhaConsultante` no corpo SOAP (`consulta.py:290-291`), vindos de `TJSPMNIUSUARIO`/`TJSPMNISENHA` (`.env.example`).
- eproc: usuário de exemplo `CAO_CAEx_Consulta_MP` (`scripts/exemplo_eproc.py:69,121`; `README.md:108`) e senha diária = SHA-256(data + segredo) com `EPROC_PASSWORD_SECRET` (`consulta.py:110-153`). **É conta institucional do MP com segredo compartilhado: não é utilizável por advogado em geral.** Elegibilidade de advogado comum ao MNI/TJSP: não demonstrada no código.
- Login web por certificado A1 (`auth_certificado.py`): assina com a chave privada o `hashDesafio` do CAS do e-SAJ (`:116-172`), declarando ser "porta" de pacote R de terceiro (`:90-91`); no eproc usa TLS mútuo com PEM da chave sem criptografia em diretório temporário nunca removido (`:227-234,262`).
- Extras: parsers MNI (`leitura.py`, `leitura_completa.py:1-25`), tabelas CNJ/SGT (`inf_web_service.py`), busca pública de jurisprudência eproc (`jurisprudencia.py`, máx. 1000 resultados por busca, README `:160`).
- Não há ciência, intimação, peticionamento nem protocolo (não encontrado no código).

## Capacidades reais vs. documentadas
Reais: consulta MNI e parsing. Dependem de credencial institucional ou do MNI habilitado; leitura de documentos só com autorização do tribunal.

## Conceitos aproveitáveis
`_verificar_sucesso` exige `<sucesso>true` na resposta SOAP em vez de confiar no HTTP 200 (`consulta.py:50-59`) — padrão a adotar para qualquer resposta MNI; retry seguro só para leitura, com backoff, em 429/5xx (`consulta.py:33-47`); tratamento de MTOM/XOP (`consulta.py:62-100`); leitura "sem interpretação" por nome local ignorando namespace (`leitura_completa.py:3-4`).

## Riscos
`verify=False` em 4 chamadas e no exemplo (`auth_certificado.py:113,125,131,170,174`); WSDL do e-SAJ por HTTP; chave A1 em disco; segredo diário compartilhado; XML parseado com `lxml`/`ElementTree` padrão, sem endurecimento contra entidades (`leitura.py:197`, `leitura_completa.py:133,211`, `consulta.py:368`); sem licença.

## Decisão
**APENAS CONCEITO (reimplementar):** sem licença não pode ser copiado; usar só a ideia de checar `sucesso`, MNI como contrato e retry; nunca `verify=False`, nunca guardar A1 do advogado no SaaS.
