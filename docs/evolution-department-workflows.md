# Checkpoint — operações departamentais

## Jurídico — revisão editorial

Implementados pedido de revisão, aprovação por outra pessoa, devolução com justificativa e histórico por versão. O documento continua no repositório existente e aparece na fila do Jurídico. As ações exigem leitura e escrita de documentos e respeitam o acesso ao caso/cliente. Quem enviou a versão ou solicitou a revisão não pode decidir. Nova versão encerra pedidos pendentes; aprovações anteriores não aprovam a nova versão. Auditoria e decisão são atômicas. O Box e o protocolo judicial permanecem desativados.

Arquivos principais: `document-review.service.ts`, `review-actions.ts`, `review-panel.tsx`, páginas de documento e Jurídico, schema e migração `20270110000000_document_reviews`.

Validação inicial: 13 testes de integração (revisão + rotina do escritório), compilação e quatro E2E de documentos/departamentos aprovados. Os E2E verificaram solicitação, fila, troca de versão e preservação da desativação do Box. Aprovação por segundo usuário foi validada no serviço, ainda sem cenário E2E dedicado com duas sessões.

## Controladoria — mesa operacional

Reutilizada a mesa de tarefas como componente compartilhado. A Controladoria permite pesquisa, filtros de responsável/situação/atraso, lista/quadro e alteração de situação com persistência. Criação, edição, comentários, responsáveis e histórico continuam nos fluxos existentes. A troca lista/quadro mantém a rota do departamento e os filtros. Conferência formal de execução e escalonamento específico ainda não estão implementados.

Arquivos principais: `tasks-workspace.tsx`, páginas de tarefas e Controladoria, `page-header.tsx`, `evolution-navigation.ts`.

## Atendimento — prévias

Links de inscrição de autenticação são ocultados nas prévias retornadas pelo serviço de conversas e antes de gravar novas prévias. O conteúdo original da mensagem é preservado. Dois testes unitários aprovados.

## Aceite restante

- Executar validação final conjunta após as mudanças da Controladoria e prévias.
- Concluir comparação funcional e lacunas dos seis departamentos; este checkpoint não representa conclusão da Evolution.
- Comercial: repasse da contratação ao Jurídico/Financeiro ainda exige implementação ou comprovação.
- Gestão por departamento e rentabilidade departamental permanecem pendentes.
- Integrações externas exigem homologação real; testes locais não comprovam envio/recebimento com provedores.
- Estas alterações ainda não foram publicadas em produção.
