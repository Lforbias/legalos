# Evolution 1.0 — Master Brief (checkpoint reference)

## Checkpoint atual — 12 nov 2026

- PRs #17–#30 estão incorporadas ao `main`; as PRs #18–#30 foram fechadas como supersedidas, sem reaplicar sua pilha.
- PR #34 está integrado no commit `1a03702` e publicado pelo deploy `43325427272`.
- CI do commit publicado passou em tipos, lint, testes, build e suíte E2E completa: **74/74**. `/api/ready` confirmou banco, migrações e armazenamento ativos.
- Decisão: **apto para homologação controlada; não aceito como homologação integral**. A sessão prática ainda precisa verificar WhatsApp com aparelho real, provedor de cobrança, repasse entre departamentos e indicadores/rotina de Controladoria com dados e perfis de teste.
- BOX e protocolo judicial permanecem desativados deliberadamente.
- Fonte de aceite e pendências detalhadas: [checklist de release](evolution-release-checklist.md) e [fluxos departamentais](evolution-department-workflows.md).

Os registros abaixo são checkpoints históricos feitos durante a implementação; não representam o estado atual quando divergem deste checkpoint.

## PR Sequence — plano histórico
- PR #17: Fundação e correções (concluído na branch; PR aberto para revisão)
- PR #18: Central de Atendimento (aberto para revisão)
- PR #19: Cliente 360° e Processo 360° (aberto para revisão)
- PR #20: Controladoria (aberto para revisão)
- PR #21: Jurídico completo (aberto para revisão)
- PR #22: Comercial do escritório (aberto para revisão)
- PR #23: Financeiro & Contábil (aberto para revisão)
- PR #24: Administração & Gestão (em validação)
- PR #25: Meu Escritório e Minha Mesa (aberto para revisão)
- PR #26: Comunicação entre departamentos (em validação)
- PR #27: APIs e integrações (em validação)
- PR #28: Paridade total Ethos → Evolution (em validação)
- PR #29: Testes e homologação (em validação)
- PR #30: Fechamento e preparação para lançamento (em validação)

## Current checkpoint
- Pré-checagem #17–#20: todas as branches têm commits salvos e os PRs estão abertos/mergeáveis. #17 tem 24 testes unitários focados registrados, porém 2 jobs de CI falharam; o diagnóstico mostra falhas E2E de navegação, WhatsApp/QR e rotas Box antigas, além de tentativas de conectar ao banco `legalos`, inexistente no job. #18–#20 tinham verificações de CI em andamento na última consulta.
- PR #17: commit `271912e` em `feature/evolution-1.0`; PR aberto; 24 testes unitários focados passaram.
- PR #18: aberto como [#18](https://github.com/Lforbias/legalos/pull/18), branch `feature/evolution-1.1-central-atendimento`, baseado no #17.
- PR #18 entregue: fila e conversas reais, disponibilidade e canais; sem alterar dados ou simular integrações. Typecheck, ESLint focado e 24 testes passaram.
- PR #19: aberto como [#19](https://github.com/Lforbias/legalos/pull/19), branch `feature/evolution-1.2-360`, baseado no #18; 24 testes unitários focados e typecheck/ESLint passaram.
- PR #20: aberto como [#20](https://github.com/Lforbias/legalos/pull/20), branch `feature/evolution-1.3-controladoria`, baseado no #19; typecheck, ESLint focado, 24 testes unitários e 31 testes de integração passaram.
- PR #20 entregue: pendências por área com contadores reais, sem incluir aniversários; Box permanece desativado.
- PR #21: aberto como [#21](https://github.com/Lforbias/legalos/pull/21), branch `feature/evolution-2.1-juridico`, baseado no #20; lista processos ativos respeitando sigilo. Typecheck, ESLint focado, 24 testes unitários e 25 de integração passaram.
- PR #22: aberto como [#22](https://github.com/Lforbias/legalos/pull/22), branch `feature/evolution-2.2-comercial`, baseado no #21; resumo do funil com dados reais. Typecheck, ESLint focado, 24 testes unitários e 23 de integração passaram.
- PR #23: aberto como [#23](https://github.com/Lforbias/legalos/pull/23), branch `feature/evolution-2.3-financeiro`, baseado no #22; saldos e fluxo de caixa reais. Typecheck, ESLint focado, 24 testes unitários e 14 testes de integração passaram.
- PR #24 checkpoint: branch `feature/evolution-2.4-administracao`, baseada no #23. Arquivos: `src/app/(evolution)/evolution/administracao/page.tsx` e este brief. Administração mostra indicadores reais permitidos pelo perfil e oculta o atalho de relatórios sem acesso. Typecheck, ESLint focado, 24 testes de navegação/flag e 6 testes de indicadores passaram; na suíte unitária ampla, 441 testes passaram e 4 suítes não carregaram por falta de `DATABASE_URL`. Pendentes: CI e revisão visual/por perfil.
- PR #25: branch `feature/evolution-2.5-escritorio-mesa`, baseada no #24. Arquivos: `src/app/(evolution)/evolution/page.tsx`, `src/app/(evolution)/evolution/mesa/page.tsx` e este brief. Meu Escritório exibe resumo pessoal real de tarefas/prazos; Minha Mesa destaca prazos vencidos e publicações distribuídas pelo serviço existente. Typecheck, ESLint focado, 24 testes de navegação/flag e 6 testes de indicadores passaram.
- PR #26: branch `feature/evolution-2.6-fluxos`, baseada no #25. Arquivos: `src/app/(evolution)/evolution/page.tsx` e este brief. Meu Escritório oferece atalhos condicionados por permissões entre Atendimento→Comercial, Comercial→Jurídico e Jurídico→Financeiro usando formulários reais. Typecheck, ESLint focado, 24 testes de navegação/flag e `git diff --check` passaram.
- PR #27: branch `feature/evolution-2.7-apis-integracoes`, baseada no #26. Arquivos: `src/app/(evolution)/evolution/administracao/page.tsx`, `src/app/(dashboard)/integracoes/page.tsx`, `docs/api.md` e este brief. Consolida o acesso, esclarece o endpoint OpenAPI autenticado e remove contagens estáticas que divergiam do catálogo versionado. Typecheck, ESLint focado, 24 testes de navegação/flag e 6 testes de integração da API passaram.
- PR #28: branch `feature/evolution-2.8-ethos-parity`, baseada no #27. Arquivos: `src/config/evolution-navigation.ts`, `src/tests/unit/evolution-navigation.test.ts` e este brief. Preenche lacunas de navegação em recursos Ethos existentes e cria verificação automática de paridade; o portal autenticado do cliente permanece fora do menu interno. Typecheck, ESLint focado e 26 testes de navegação/flag passaram.
- PR #29 checkpoint: branch `feature/evolution-2.9-homologacao`, baseada no #28. Arquivos: `src/tests/e2e/workspace-ux.spec.ts` e este brief. `npm run typecheck`, `npm run lint`, `npm test` com o banco `legalos_test` e `npm run build` passaram; Vitest: 188 arquivos / 1.368 testes. Corrigi as expectativas UX desatualizadas (nome atual “Processos e casos”, estado desativado dos certificados do Box e texto/ARIA do painel RUTE); E2E focados de workspace e workspace-ux passaram. A execução E2E completa foi interrompida após 7 falhas (6 em fluxos antigos do Box e 1 redirecionamento do superadmin) e 1 teste interrompido; 60 não rodaram. Pendente: revisar/corrigir os E2E do Box sem reativar o produto, investigar a falha do superadmin e completar o E2E por perfil/visual. Não declarar pronto para homologação ainda.
- PR #30: aberto como [#30](https://github.com/Lforbias/legalos/pull/30), branch `feature/evolution-2.10-fechamento`, baseada no #29. Arquivos: `docs/evolution-release-checklist.md` e este brief. Os PRs #17–#30 estão abertos e mergeáveis na consulta atual. O handoff registra 188 arquivos/1.368 testes Vitest aprovados, build aprovado, 2 E2E focados aprovados e a suíte E2E completa incompleta com pendências críticas documentadas. Nenhum merge/deploy foi feito.

## Estabilização no PR #30

- Superadmin confirmado em rota protegida e Box validado como retirado. Correções de navegação, permissões e revisão visual registradas no [checklist de aceite](evolution-release-checklist.md).
- Dois E2E completos de 73 cenários. Resultado final no banco isolado: 63 aprovados e 10 falhas. Os 60 cenários que faltavam foram executados. Build, tipos, lint, 31 testes unitários focados e o E2E dos seis departamentos passaram.
- Decisão de aceite: **NÃO APTO PARA HOMOLOGAÇÃO**. Permanecem falhas na suíte E2E e verificações de CI. A cadeia #17–#30 foi conferida.

## Revisão do WhatsApp por QR

- O Baileys recebeu um QR real do WhatsApp Web. O E2E com driver de teste confirmou pareamento, troca e desconexão. A leitura do QR com o número do escritório fica para homologação.
- Corrigidos o bloqueio de 2FA do Box no WhatsApp, o desaparecimento dos códigos de recuperação, o fuso da sessão PostgreSQL e a sobreposição da RUTE no Chat.
- Build, lint e 1.368 testes Vitest passaram. E2E: 72 passaram na suíte completa e o cenário restante passou em nova execução após validar o registro persistido. Veja o [checklist de aceite](evolution-release-checklist.md).
