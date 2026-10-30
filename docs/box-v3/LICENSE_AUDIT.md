# Box 3.0 — auditoria de licenças dos projetos externos

Verificado em 29–30/10/2026, direto no arquivo `LICENSE` (ou ausência dele) de cada clone — não no README. Ver `docs/box-v3/audit/*.md` para o detalhe técnico de cada repositório.

| Repositório | Licença confirmada | Condição de reutilização |
|---|---|---|
| ricarossetto/Atrium-Senda | MIT (`LICENSE`, Copyright 2026 Atrium Senda Contributors) | Código pode ser portado/adaptado mantendo o aviso de copyright e a licença MIT. Só módulos puros (CNJ, fingerprint, diff, sanitização) foram aproveitados; o 2º fator automatizado e o A3 simulado foram descartados por risco (ver auditoria). |
| fbmoulin/Pje-MCP- | MIT (`LICENSE`, Copyright 2025 TJES PJE MCP Server Contributors) | Reutilizável com aviso; usado apenas como referência de arquitetura (MCP, cert_manager), pois o A3 nele não é real. |
| Dramorimrodrigues/maat-monitor | MIT (`LICENSE`, Copyright 2026 Márcio Luis Amorim) | Reutilizável com aviso; aproveitado só como conceito (detecção de novidade por chave única), por limitações no mapeamento de graus/índice. |
| lucmolero/nanojud | MIT (`LICENSE`, Copyright 2026 Luciano Molero) | Reutilizável com aviso; aproveitado só como conceito, por erro confirmado no mapeamento do STJ (J=2 em vez de J=3) e lacunas (TST, TREs, TJMs). |
| fbmoulin/pje-mcp-server (chapirousIA) | MIT, mas `LICENSE` com placeholder "[Seu Nome]" em vez de autor real | Tratado como MIT para fins de permissão de uso, mas o peticionamento é comprovadamente fictício (`Math.random()` como "protocolo") — nenhuma linha de protocolo foi aproveitada; só o conceito de exposição de ferramentas via MCP. |
| ArthurCarrenho/extensao-eproc | AGPLv3 (`LICENSE`) | **Não pode ser incorporada ao código do SaaS proprietário** sem abrir o código correspondente. Usada só como referência funcional (como o eproc expõe eventos no DOM), nunca copiada. |
| fbmoulin/pje-download | Nenhum arquivo de licença no repositório | Sem autorização de reuso de código. Só conceitos de arquitetura (fila confiável, validação de PDF, taxonomia de erros) foram registrados, para reimplementação própria. |
| jjesusfilho/vinea | Nenhum arquivo de licença no repositório | Idem. Além disso, o exemplo de eproc usa uma conta institucional do MP com senha derivada de segredo compartilhado — não serve de modelo de credencial para advogado comum. |
| gbrb1/JuriScraper | Nenhum arquivo de licença no repositório | Idem. O módulo de resolução automática de CAPTCHA (ONNX) é descartado por completo, sem exceção; os seletores de consulta pública (e-SAJ/PJe-TRT) são só referência a revalidar. |
| gestoricit/pje-mni-client | Nenhum arquivo de licença no repositório | Sem autorização de reuso. Descartado: simula sucesso em caso de erro (prova de conceito não confiável), incompatível com o MNI 2.2.2 real. |
| HenriqueMartinelli/peticionamento_pje | Nenhum arquivo de licença no repositório | Sem autorização de reuso. Contorna CAPTCHA por serviço pago (descartado) e declara sucesso sem comprovante; só o modelo de dados de entrada da petição avulsa foi registrado como conceito. |
| odantasvictor/movimentacoes_processuais | Nenhum arquivo de licença no repositório | Sem autorização de reuso; parado desde 2022, com SQL injetável e verificação de TLS desabilitada — descartado por completo. |

**Regra aplicada no código do LegalOS:** nenhuma linha foi copiada de um repositório sem licença permissiva explícita (MIT) nem de um AGPLv3. Onde algo de MIT foi de fato reaproveitado (módulos puros do Atrium-Senda), o aviso de copyright correspondente é preservado no arquivo de destino.
