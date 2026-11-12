# LegalOS Evolution 1.0 — checklist de aceite

**Decisão: NÃO APTO PARA HOMOLOGAÇÃO.** A suíte completa de navegador ainda tem falhas e o CI dos PRs empilhados ainda não está aprovado.

| Verificação | Evidência |
|---|---|
| Tipos, ESLint e build | Aprovados nesta rodada. |
| Testes unitários focados | 31 aprovados em navegação, flag da Evolution e retirada do Box. A rodada anterior aprovou 1.368 testes no Vitest completo. |
| Superadmin | Cenário aprovado. A raiz pública já era reescrita para `/produto` na `main`. O teste agora abre `/dashboard` e confirma bloqueio em `/suspenso` e retorno ao painel após reativação. |
| Box retirado | Os seis cenários originais passaram com a nova expectativa. Os E2E verificam 404 nas páginas e 410 com `box_removed` nas APIs bloqueadas, sem cache, inclusive com a antiga flag do Box 2.0 ligada. Documentos, relatórios disponíveis e integrações públicas mantêm cobertura própria. |
| Seis departamentos | Revisão no Chromium em 1440 e 390 px. Jurídico, Controladoria, Atendimento, Comercial, Financeiro e Administração abriram com títulos e ações esperados. Os seis atalhos principais foram seguidos até o destino. A revisão verificou entrada móvel, busca global, Desktop, retorno à Ethos e acesso com perfil financeiro restrito. Foi usado um escritório novo, sem dados de produção nem conectores reais. |
| E2E completo | Primeira execução desta rodada: 73 executados, 52 aprovados e 21 falhas. Segunda execução no banco dedicado `legalos_stabilization_test`: 73 executados, 63 aprovados e 10 falhas. Nenhum cenário ficou por executar. |
| Pilha de PRs | #17 tem base `main` e #18–#30 têm como base a branch do PR anterior. A ancestralidade dos commits publicados foi conferida e o GitHub marcou todos como mergeáveis. A consulta registrou falhas em `verify` em #17–#26 e verificações em andamento em #27–#30. |

## Correções da Evolution

- Desktop e busca respeitam a permissão da Área de Trabalho.
- A visão geral de cada departamento fica disponível no menu mesmo quando o perfil não tem atalhos internos.
- O menu móvel da Ethos oferece entrada para a Evolution. A barra superior da Evolution acomoda os controles sem cortá-los.
- Atendimento filtra conversas vinculadas a processos que o perfil não pode consultar e respeita a permissão de leitura de clientes ao exibir nomes.
- Administração e Comercial ganharam espaçamento entre as seções identificado na revisão móvel.

## Bloqueios

- A conexão Meta e o QR do WhatsApp chamam a verificação de 2FA do cofre de certificados, que exige o Box legado. O mesmo caminho está na `main`. Os testes preservam a exigência de 2FA e a retirada do Box.
- Oito outros cenários falharam. São 2FA obrigatório (tela mudou antes de confirmar os códigos de recuperação), IA sem chave (texto esperado ausente), tarefa LegalMail (campo de comentário ambíguo), importação LegalMail (opção DataJud esperada ausente), preços (contagem do catálogo), duas verificações de vitrine pública e prospecção (campo de anotações após recarregar). Esses resultados não demonstraram uma regressão causada pela Evolution.
- O CI dos PRs empilhados continua pendente de aprovação. A situação de mergeabilidade indica ausência de conflito Git.

Para reproduzir, use `npm run build` e `npm run test:e2e` com `DATABASE_URL` e `TEST_DATABASE_URL` apontando para um PostgreSQL isolado de teste. O projeto Chromium ativa a Evolution e o teste `src/tests/e2e/evolution.spec.ts` grava as 12 capturas em `test-results/`.

Nenhum merge ou deploy foi executado.
