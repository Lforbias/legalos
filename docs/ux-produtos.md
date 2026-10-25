# Organização visual dos produtos LegalOS

## Base compartilhada

Func, Box e Chat usam a mesma tipografia, superfícies neutras, hierarquia de títulos, campos e estados de foco. A cor identifica o espaço: índigo no Func, verde-água no Box e dourado no Chat. Os valores de cor e as versões dos logotipos estão em `src/app/globals.css` e `public/brand/`.

Cada tela prioriza uma ação principal. Ações complementares ficam em menus ou painéis expansíveis. Filtros ativos permanecem identificáveis e podem ser limpos. As consultas e as permissões continuam nos serviços existentes.

## Func: gerir o escritório

O ponto de entrada destaca pendências, financeiro e distribuição de trabalho. Processos, clientes, tarefas, prazos e agenda seguem a mesma hierarquia visual. As fichas possuem retorno à lista e seleção de seções no celular. Na tarefa, situação, responsável e vencimento aparecem antes do histórico.

## Box: receber, distribuir e tratar

1. **Visão geral:** fila de trabalho, itens sem distribuição, intimações pessoais e pendências antigas. Histórico de recebimentos e indicadores de integrações ficam em áreas expansíveis.
2. **Caixa de entrada:** busca e responsável à vista; tipo, origem, tribunal e datas em filtros complementares. No celular, um seletor apresenta todas as caixas e equipes.
3. **Leitura:** alternância entre tabela e leitura integrada. Limpar filtros preserva a caixa de trabalho e o modo de leitura.
4. **Continuidade:** os caminhos existentes para tarefas, prazos, peticionamento, monitoramento e certificados permanecem disponíveis conforme as permissões.

## Chat: conversar com contexto

1. **Preparação:** quando não há número conectado, a tela orienta a conexão e apresenta os passos de organização do atendimento.
2. **Conversas:** lista com busca, caixas de trabalho, número, fila e etiquetas. A seleção e as mensagens não lidas usam a identidade do Chat. O estado exibido corresponde à situação do atendimento.
3. **Atendimento:** mensagens e composição ocupam a área principal. Em telas amplas, as informações ficam ao lado; em telas menores, abrem em um painel modal com fechamento por botão ou Escape e retorno do foco ao gatilho.
4. **Contexto preservado:** abrir a conversa e voltar à lista mantém os filtros. O filtro de situação acompanha os demais refinamentos da mesma caixa.
5. **Configurações:** índice de assuntos com atalhos para conexão, rotina, equipe, automações, conteúdo e campanhas. Os formulários existentes permanecem na mesma página; essa etapa não os converte em abas independentes.

## Limites desta rodada

Esta organização não adiciona conectores, não homologa tribunais ou números reais e não altera as regras de envio de mensagens. A publicação do Func e a preparação visual de Box/Chat são entregas distintas; a disponibilidade em produção depende do commit publicado.

O refinamento das telas especializadas de peticionamento, certificados, relatórios, campanhas e edição de automações deve seguir a mesma base visual em rodadas posteriores.
