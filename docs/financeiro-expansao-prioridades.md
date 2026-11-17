# Expansão Financeira e Contábil

## Auditoria do código atual

Esta leitura é baseada nas telas e serviços presentes no repositório. Ela não confirma o funcionamento em produção.

- **Lançamentos:** contas a pagar e receber, vencimentos, categorias, centros de custo, parcelas, pagamentos parciais e estornos.
- **Visões:** painel financeiro, vencidos e próximos vencimentos, fluxo anual e resultado por centro de custo.
- **Cobrança:** faturas e integração configurável de Pix/boleto via Asaas.
- **Honorários:** contratos de êxito vinculados a clientes/processos e geração de lançamento quando o gatilho é cumprido.
- **Cadastros e saída de dados:** contas financeiras, categorias, centros de custo e exportações existentes.

## Próxima entrega recomendada: conciliação bancária assistida

É a lacuna operacional mais clara em relação aos lançamentos já existentes. O escritório importa o extrato, confere sugestões de correspondência e confirma cada conciliação. O sistema não cria baixas automaticamente sem confirmação.

### Primeira versão

1. Importar CSV de extrato e revisar a prévia antes de gravar.
2. Permitir mapear data, descrição, valor, identificador e entrada/saída quando os cabeçalhos variarem.
3. Detectar reimportação pelo identificador bancário ou por uma impressão digital estável da linha.
4. Sugerir lançamentos compatíveis por valor, data, direção e texto, deixando a decisão final para o usuário.
5. Permitir conciliar, ignorar ou marcar uma linha para revisão; registrar usuário e horário de cada decisão.
6. Exibir resumo de conciliados, sem correspondência, duplicados e pendentes.

## Sequência proposta depois da conciliação

1. **DRE gerencial por competência:** receitas e despesas reconhecidas no período, com filtros por centro de custo, cliente e processo.
2. **Previsão de caixa:** projetar recebimentos e pagamentos futuros, separar realizado de previsto e apontar atrasos.
3. **Contabilidade e fiscal:** definir plano de contas, exportação para contador e documentos fiscais somente após validar o modelo contábil e as integrações necessárias.

## Limite desta etapa

O módulo atual já tem contas, lançamentos, cobrança, honorários e relatórios gerenciais. A conciliação bancária começou em uma versão local; ainda precisa de revisão, testes com extratos reais e implantação antes de ser considerada entregue.

## Andamento da primeira entrega

Foi iniciada uma versão local com importação CSV mapeável, detecção de linhas repetidas, sugestões de lançamentos e confirmação manual para registrar a baixa. Ela ainda precisa passar por revisão técnica, testes com extratos de bancos diferentes e implantação antes de ser considerada disponível.
