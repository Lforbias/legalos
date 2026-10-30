# LegalOS Box 3.0 — e-SAJ/PROJUDI além do MNI: pesquisa e recomendação

> Este é um documento de ESCOPO e PESQUISA, não de implementação. Nenhum conector novo foi construído por causa
> dele — de propósito, pelos motivos abaixo. Faz parte do item 3 da lista de pendências em
> `IMPLEMENTATION_STATUS.md`.

## A pergunta

O roadmap do Box 3.0 previa, depois do MNI (que já exige credencial e está mapeado em `CONNECTOR_MATRIX.md`),
avaliar uma consulta PÚBLICA (sem login, sem certificado) às páginas de consulta processual do e-SAJ (TJSP, TJAL,
TJAM, TJCE, TJMS, TJPB, TJPE, TJRO, TJSE e outros) e do PROJUDI (TJPR e outros), nos moldes do que já existe para
DJEN e DataJud. Antes de escrever qualquer linha de código, pesquisei (via busca na web, outubro/2026) se isso é
viável hoje sem violar a regra mais rígida do prompt mestre: nunca contornar CAPTCHA.

## O que a pesquisa encontrou

- **CAPTCHA está sendo ativamente ampliado, não reduzido, nessas consultas públicas.** O TJPB anunciou a adoção
  de CAPTCHA na consulta pública do e-SAJ em 2026 ("Sistema CAPTCHA será adotado pelo TJPB", tjpb.jus.br). O
  TRT-SC fez o mesmo movimento na consulta pública do PJe ("TRT-SC adota mecanismos para ampliar a segurança da
  consulta pública ao PJe", portal.trt12.jus.br) — ambos citando explicitamente a necessidade de barrar acesso
  automatizado/robôs. Não encontrei nenhum tribunal relaxando CAPTCHA no sentido contrário.
- **Não existe API pública oficial estável para e-SAJ ou PROJUDI**, nem sinal de o CNJ estar padronizando uma além
  do DataJud (que já cobre dados públicos de processo e movimentos nacionalmente) e do DJEN (publicações). As
  buscas sobre uma possível expansão do DataJud não trouxeram nenhum ato normativo ou anúncio oficial nesse
  sentido em 2026.
- **Toda referência de código livre já auditada para esse caso específico (ver `docs/box-v3/audit/`) é inviável
  por licença ou por prática**: o JuriScraper tem um scraper de e-SAJ/CPOPG, mas sem `LICENSE` (só ideia,
  reimplementação do zero, sem copiar código) — e o mesmo repositório tem, para outro tribunal (PJe-TRT), um
  resolvedor automático de CAPTCHA por modelo ONNX, já **descartado** nesta auditoria por contornar verificação
  anti-automação. O `movimentacoes_processuais` (scraping de consulta pública do PJe estadual, 11 TJs, sem
  login) não tem licença e está desatualizado desde 2022 — seletores de HTML quase certamente quebrados, e
  mesmo que funcionassem, reimplementar do zero sem poder testar contra os 11 tribunais reais seria especular, não
  verificar.
- **Existem agregadores comerciais** (ex.: judit.io, e um scraper de DataJud publicado na Apify) que vendem
  consulta processual normalizada cobrindo tribunais estaduais, incluindo provavelmente e-SAJ/PROJUDI por trás de
  API própria. Não investiguei a fundo o método deles (pode envolver parceria direta com tribunais, proxies, ou
  prática que o LegalOS não adotaria) — cito só como alternativa de MERCADO a considerar, nunca como coisa a
  copiar sem auditoria própria.

## Por que eu não construí o conector mesmo assim

Construir um scraper de HTML por tribunal, sem conseguir testar contra nenhum site real a partir destes
ambientes (nem o de nuvem, nem a VM ligada ao Mac da Dra. Talita têm acesso de rede confirmado às páginas reais
do e-SAJ/PROJUDI), e sabendo que pelo menos dois tribunais já estão ativamente adicionando CAPTCHA especificamente
contra esse tipo de automação, seria: (1) quase certo de quebrar na primeira tentativa real ou no primeiro
CAPTCHA encontrado — e nessa hora o código CORRETO é parar e pedir ação humana, nunca contornar, então o "código
pronto" teria valor limitado; e (2) impossível de verificar de verdade antes de entregar, o que seria declarar
sucesso sem evidência — exatamente o que o prompt mestre proíbe com mais força.

## Recomendação

Não é uma decisão técnica, é uma decisão de produto/negócio que cabe à Dra. Talita: (a) continuar só com
DJEN+DataJud+MNI (onde o tribunal oferecer) por enquanto, aceitando que processos em tribunais e-SAJ/PROJUDI sem
MNI habilitado não têm cobertura automática de movimentação pública; (b) autorizar a construção de um scraper
próprio, sabendo que ele vai precisar de manutenção constante por tribunal e vai parar (corretamente) toda vez
que aparecer um CAPTCHA, até alguém resolver manualmente; ou (c) avaliar comercialmente um agregador como
judit.io como fonte de dados paga, com auditoria própria de como eles obtêm os dados antes de integrar. Nenhuma
das três foi escolhida nesta sessão — fica registrada como pendência de decisão, não de código.
