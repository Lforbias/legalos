# Página de preços e comparativo

Rota pública: `/produto/precos`. Levantamento conferido em 26/10/2026.

## Decisões comerciais

- Quatro níveis solicitados: Simples, Básico, Intermediário e Avançado.
- Nenhum valor LegalOS, quota ou composição final foi decidido. Os cartões mostram **Em definição**, estrutura proposta e focos sugeridos. Não há checkout nem alteração dos planos de cobrança existentes.
- Custos externos de IA, WhatsApp, pagamentos e integrações devem entrar na análise comercial futura. Não anunciar economia percentual antes de existir preço e cenário equivalente.
- Os atalhos do início e do comparativo levam a `#planos`, no final da página.

## Preços públicos de terceiros

`src/config/pricing.ts` guarda os valores, condições, fontes e uma fotografia da cobertura anunciada. Valores devem ser revisados antes de novas campanhas.

| Empresa | Base usada | Média aritmética |
|---|---|---|
| LegalMail | 187, 297, 550, 997, 2.437; mensais | R$ 893,60 |
| ADVBOX | 220, 450, 900, 1.800, 5.000; a partir de, ativação adicional | R$ 1.674,00 |
| Astrea | 209, 379, 689, 1.249; equivalentes mensais do anual | R$ 631,50 |
| ChatGuru | Entrada anunciada de R$ 119 sem associação a plano; valores por plano não publicados | Não calculável |

ADVBOX Elite diverge entre tabela e calculadora; a página registra ambos e usa a tabela na média. Big Offices eleva a média: sem ele, R$ 842,50. Astrea Light gratuito por um ano e VIP+ sob consulta ficam fora da média. A entrada ChatGuru não é imputada ao Essencial nem usada para inventar os demais preços. As médias não equivalem ao orçamento de um escritório e não são somadas como se todos os fornecedores precisassem ser contratados.

Fontes: https://www.legalmail.com.br/ ; https://advbox.com.br/planos ; https://www.aurum.com.br/astrea/planos-e-precos/ ; https://chatguru.com.br/planos-e-precos/ . Para disponibilidade de API, também foram consultados a central oficial LegalMail e o site institucional ChatGuru, vinculados na página.

Logotipos obtidos dos sites oficiais para identificação comparativa. ADVBOX e Astrea: SVGs do cabeçalho; ChatGuru: arquivo da marca do site; LegalMail: ícone oficial do cabeçalho. Versões raster reduzidas em `public/produto/concorrentes`, exibidas com aparência pixelizada e nome legível. Marcas não indicam vínculo comercial.

## Critério do comparativo

- “Disponível”: recurso anunciado pelo fornecedor ou implementado no LegalOS.
- “Conforme plano”: cobertura e limites dependem da contratação.
- “Não confirmado”: a fonte consultada não sustenta uma conclusão; nunca equivale a “não possui”.
- “Requer configuração”: existe implementação, mas depende de provedor, conta, escopo ou habilitação.
- “Em validação”: dependência externa ainda não homologada; aplica-se ao protocolo e captura de autos do LegalOS, sem alegar cobertura universal dos tribunais.

A tabela compara áreas da rotina, não afirma equivalência entre produtos ou superioridade em todas as linhas. Não se usa a ausência de documentação pública para inventar desvantagens do concorrente.

## Catálogo de 300 itens

`src/config/pricing-features.ts` contém 300 recursos e operações granulares com referência a serviço e export existente. Consultar, cadastrar, editar e excluir são operações distintas; não são 300 módulos independentes nem 300 diferenciais exclusivos. Também não representam o número de comandos da RUTE ou garantia de inclusão em qualquer plano.

O catálogo é pesquisável e agrupado. Cada item tem uma referência `evidence` interna, que o teste confere no código. Essa referência não é enviada ao componente público de busca. Grupos com condições externas as informam. O inventário não substitui homologação, teste funcional completo ou contrato comercial.

Verificação: teste de conteúdo confere 300 IDs, descrições e evidências distintas e suas exportações existentes; teste de navegação cobre página pública, imagens, fontes, busca, filtro, ausência de resultados, âncoras, planos sem valores e ausência de transbordamento global em diferentes larguras.
