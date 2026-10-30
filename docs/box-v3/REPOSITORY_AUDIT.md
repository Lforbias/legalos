# Box 3.0 — auditoria dos repositórios externos de referência

Resumo executivo da auditoria dos 12 repositórios indicados no prompt mestre, feita por leitura direta de código (nunca só README), sem executar nada deles. O detalhe de cada um, com arquivo:linha, está em `docs/box-v3/audit/<repositorio>.md`. Licenças em `docs/box-v3/LICENSE_AUDIT.md`.

| Repositório | Decisão | Por quê (achado principal) |
|---|---|---|
| Atrium-Senda | Reutilizar só módulos puros (MIT) | 2º fator automatizado com TOTP guardado é contorno de MFA por desenho (`auth-adapters.mjs`); A3 não existe de verdade (PJeOffice é só um GET de saúde). |
| pje-download | Apenas conceito | Sem licença. Boa arquitetura de fila/retry/validação de PDF, mas MNI via CPF+senha (sem certificado) e proxy para contornar bloqueio de IP. |
| nanojud | Apenas conceito | MIT, mas mapeia STJ incorretamente (J=2 em vez de J=3) e não cobre TST/TREs/TJMs — o contrato do DataJud/DJEN documentado foi conferido e reimplementado do zero, corrigido. |
| vinea | Apenas conceito | Sem licença. Exemplo de eproc usa conta institucional do MP, não aplicável a advogado comum; `verify=False` em várias chamadas. |
| Pje-MCP- (TJES) | Apenas conceito | MIT, mas A3 não está implementado (vira requisição sem certificado); endpoints PJe nunca testados contra tribunal real. |
| maat-monitor | Apenas conceito | MIT, mas usa `size:1` no DataJud (perde graus) e tem estimador de prazo que não deve ser usado como contagem oficial. |
| JuriScraper | Apenas conceito, parcial | Sem licença. Resolve CAPTCHA automaticamente com modelo ONNX — módulo inteiro descartado. Seletores de consulta pública (e-SAJ/PJe-TRT) registrados como referência a revalidar. |
| pje-mni-client | Descartar | Sem licença. Simula sucesso em erro (lista vazia, "baixado completamente" apesar de falha); incompatível com o MNI 2.2.2 real. |
| extensao-eproc | Apenas conceito | AGPLv3 — não incorporável ao SaaS proprietário. Útil só como referência de como o eproc expõe eventos no DOM. |
| peticionamento_pje | Apenas conceito, parcial | Sem licença. Contorna hCaptcha (descartado) e retorna `sucesso: true` sem checar protocolo. Modelo de dados da petição avulsa (tipo, arquivos, processo, tarefa) registrado como conceito. |
| movimentacoes_processuais | Descartar | Sem licença, parado desde 2022, SQL injetável, TLS desabilitado. |
| pje-mcp-server (chapirousIA) | Apenas conceito | MIT com autor placeholder. Peticionamento fictício (`Math.random()` como "protocolo"); só o conceito de exposição de ferramentas via MCP foi considerado. |

## O que entrou de fato nesta entrega

Nada do código externo foi copiado linha a linha. O que foi efetivamente usado:
- **Conceito confirmado, não copiado:** o contrato real do DataJud (índice, corpo da busca, campos de resposta) e do DJEN (endpoint, paginação) já estava corretamente implementado no próprio LegalOS (`src/lib/datajud/client.ts`, `src/lib/djen/client.ts`, da fase anterior do Box) — a auditoria do nanojud serviu para CONFIRMAR esse contrato por uma segunda fonte independente, não para substituí-lo.
- **Princípio de design confirmado:** "detectar CAPTCHA e parar, nunca resolver" (já era a prática do LegalOS) é exatamente o padrão encontrado no único ponto saudável do JuriScraper (`TjspScraper.cs:70-73`), e o oposto do que os projetos descartados fazem.

## O que NÃO entrou

Qualquer mecanismo de contorno de CAPTCHA (JuriScraper/ONNX, peticionamento_pje/hCaptcha), qualquer "sucesso" sem comprovante oficial (pje-mni-client, pje-mcp-server, peticionamento_pje), qualquer automação de 2º fator sem o usuário (Atrium-Senda), e qualquer código sob licença que não permite reuso em SaaS proprietário (tudo sem licença, e o AGPLv3 da extensao-eproc).
