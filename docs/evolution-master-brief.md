# Evolution 1.0 — Master Brief (checkpoint reference)

## PR Sequence
- PR #17: Fundação e correções (concluído na branch; PR aberto para revisão)
- PR #18: Central de Atendimento (aberto para revisão)
- PR #19: Cliente 360° e Processo 360° (aberto para revisão)
- PR #20: Controladoria (aberto para revisão)
- PR #21: Jurídico completo (aberto para revisão)
- PR #22: Comercial do escritório (em implementação)
- PR #23: Financeiro & Contábil
- PR #24: Administração & Gestão
- PR #25: Meu Escritório e Minha Mesa
- PR #26: Comunicação entre departamentos
- PR #27: APIs e integrações
- PR #28: Paridade total Ethos → Evolution
- PR #29: Testes e homologação
- PR #30: Fechamento e preparação para lançamento

## Current checkpoint
- Pré-checagem #17–#20: todas as branches têm commits salvos e os PRs estão abertos/mergeáveis. #17 tem 24 testes unitários focados registrados, porém 2 jobs de CI falharam; o diagnóstico mostra falhas E2E de navegação, WhatsApp/QR e rotas Box antigas, além de tentativas de conectar ao banco `legalos`, inexistente no job. #18–#20 tinham verificações de CI em andamento na última consulta.
- PR #17: commit `271912e` em `feature/evolution-1.0`; PR aberto; 24 testes unitários focados passaram.
- PR #18: aberto como [#18](https://github.com/Lforbias/legalos/pull/18), branch `feature/evolution-1.1-central-atendimento`, baseado no #17.
- PR #18 entregue: fila e conversas reais, disponibilidade e canais; sem alterar dados ou simular integrações. Typecheck, ESLint focado e 24 testes passaram.
- PR #19: aberto como [#19](https://github.com/Lforbias/legalos/pull/19), branch `feature/evolution-1.2-360`, baseado no #18; 24 testes unitários focados e typecheck/ESLint passaram.
- PR #20: aberto como [#20](https://github.com/Lforbias/legalos/pull/20), branch `feature/evolution-1.3-controladoria`, baseado no #19; typecheck, ESLint focado, 24 testes unitários e 31 testes de integração passaram.
- PR #20 entregue: pendências por área com contadores reais, sem incluir aniversários; Box permanece desativado.
- PR #21: aberto como [#21](https://github.com/Lforbias/legalos/pull/21), branch `feature/evolution-2.1-juridico`, baseado no #20; lista processos ativos respeitando sigilo. Typecheck, ESLint focado, 24 testes unitários e 25 de integração passaram.
- PR #22: em implementação na `feature/evolution-2.2-comercial`; resumo do funil e leads recentes via `listLeads`, sem escrita nova. Typecheck, ESLint focado, 24 testes unitários e 23 testes de integração de CRM passaram.
- Próximo: concluir e abrir #22; depois Financeiro (#23). CI e conferência visual/por perfil continuam pendentes para a sequência.
