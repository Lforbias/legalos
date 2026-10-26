# LegalOS Comercial (8.0.0)

Espaço **separado** para a equipe de vendas do próprio LegalOS, em `/comercial`. Não lê nem grava nada dos escritórios clientes (processos, clientes, documentos): só cadastros de prospecção.

## Quem entra
- Super-administradores da plataforma (gerência automática).
- Pessoas adicionadas em **Equipe** (`/comercial/equipe`): *Gerência* (edita preços, premissas, equipe, importa e remove) ou *Vendas* (cadastra, registra contatos, move o funil e monta propostas).
- Todos precisam de conta no LegalOS **com 2FA ativo**. Sem acesso, a página responde 404.

## Telas
- **Painel**: MRR fechado, funil aberto/ponderado, conversão, retornos atrasados, equipe e projeção.
- **Funil**: colunas por etapa; trocar etapa pelo seletor (perdido pede motivo; ganho pede valor mensal).
- **Mapa**: OpenStreetMap, ponto por escritório na cor da etapa; pontos maiores = lista dos 100. Botão "Localizar 8 agora" geocodifica em lotes (1 consulta/s).
- **Escritórios**: lista, busca (nome, bairro, CNPJ, telefone), filtros e cadastro pelo CNPJ ou só pelo nome. Ficha: cadastro completo, contatos, histórico, proposta.
- **Base da Receita**: busca na base pública já importada (`/admin/comercial/prospeccao`) e leva o escritório ao funil com um clique; respeita "não contatar".
- **Preços e planos**: planos oficiais (`src/config/pricing.ts`), aditivos (RUTE, assinatura) e simulador.
- **Projeção**: 3 cenários em 12 meses + premissas (chance e dias até fechar por etapa; churn).
- **Importar**: CSV com `nome, cnpj, telefone, email, site, ranking, fonte, advogados, areas, tags, rua, numero, bairro, cep`.

## Dados externos
- CNPJ: `https://brasilapi.com.br/api/cnpj/v1/<cnpj>` (troque com `CNPJ_API_URL`).
- Geocodificação: Nominatim do OpenStreetMap (`NOMINATIM_URL`; `NOMINATIM_EMAIL` identifica o contato, recomendado pela política de uso).
- Não existe API pública com "todos os advogados de São Paulo" nem ranking. A lista dos 100 é montada pela equipe e importada. Para uma varredura completa por atividade (CNAE 6911-7/01) no município de São Paulo, o caminho é a base aberta de CNPJ da Receita (arquivos mensais grandes); fica como próximo passo.

## Como calcula a projeção
Cada escritório aberto entra com `valor mensal × chance` no mês em que se espera fechar (data prevista da ficha, ou os dias padrão da etapa). O MRR já fechado sofre o churn mensal. Cenários multiplicam a chance por 0,6 / 1 / 1,3 (limitada a 100%). **É estimativa**: calibre as premissas com a realidade.

## Preços
`proposta = plano + aditivos (fixos ou por usuário) − desconto`. Preço ausente nunca vira zero: a proposta não salva. RUTE e assinatura nascem como aditivos **sem preço**: a gerência define em Preços e planos.

## Demonstração
`DATABASE_URL=… npx tsx scripts/demo-seed-comercial.ts <email>` cria 12 escritórios **fictícios** e torna o usuário administrador da plataforma (apenas em banco de demonstração).
