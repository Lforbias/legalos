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

## Comercial — conversão em cadastro existente

A conversão agora oferece escolha explícita de cliente ativo do próprio escritório, mantendo os dados originais. A seleção exige leitura de clientes e as permissões anteriores de conversão. Tipo de pessoa e escritório são conferidos; falhas desfazem a operação. 25 testes focados do CRM aprovados.

## Validação conjunta

- 1.353 testes de código aprovados (188 arquivos).
- Seis testes de revisão repetidos com o Box desativado, aprovados.
- Compilação final aprovada após a mudança do Comercial.
- Primeira execução completa de interface: 72/73 aprovados. O cenário da Controladoria recarregava antes de aguardar a resposta da gravação; espera ajustada; os seis E2E finais de departamentos, documentos e CRM passaram no build final, incluindo o novo cenário de cliente existente. A gravação foi conferida após recarregar a página.
- PR #33: https://github.com/Lforbias/legalos/pull/33.

## Registro histórico — aceite restante no PR #33

- CI e publicação do PR #33 foram concluídos em seguida.
- Concluir comparação funcional e lacunas dos seis departamentos; este checkpoint não representa conclusão da Evolution.
- Comercial: repasse da contratação ao Jurídico/Financeiro ainda exige implementação ou comprovação.
- Gestão por departamento e rentabilidade departamental permanecem pendentes.
- Integrações externas exigem homologação real; testes locais não comprovam envio/recebimento com provedores.
- Estas alterações foram incorporadas e publicadas com o PR #33.

## Estado atual após o PR #34

- O CI do commit publicado `1a03702` passou em tipos, lint, testes, build e E2E completo (74 testes). O endpoint de prontidão em produção confirmou banco, migrações e armazenamento ativos.
- Jurídico e Comercial: revisão editorial, conversão com cliente existente e proposta enviada estão cobertas pelo código/testes; falta homologar dados/fluxo real e comprovar repasse transacional entre áreas.
- Controladoria: mesa de tarefas e alertas operam com dados reais; ainda não existe rotina formal própria de conclusão/escalonamento/auditoria.
- Financeiro e Administração: há indicadores e controles existentes por permissão; falta sessão com dados e perfis representativos, além do aceite de rentabilidade departamental.
- Atendimento: QR e webhooks têm cobertura automatizada, mas o número real do escritório e um provedor de cobrança precisam ser validados pelo cliente durante a homologação.
- BOX e protocolo judicial permanecem desativados. Não fazem parte do caminho de aceite enquanto reconstruídos.
- As PRs #18–#30 já estão em `main` e foram fechadas como supersedidas. O status e a decisão de aceite estão em `evolution-release-checklist.md`.
