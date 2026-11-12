# LegalOS Evolution 1.0 — checklist de aceite

**WhatsApp por QR pronto para testar com o aparelho do escritório.** A liberação depende da verificação do CI e da leitura do QR em homologação.

| Verificação | Evidência |
|---|---|
| Tipos, ESLint e build | Aprovados na revisão do QR. |
| Vitest completo | 188 arquivos e 1.368 testes aprovados na revisão do QR. |
| Superadmin | Cenário aprovado. A raiz pública já era reescrita para `/produto` na `main`. O teste agora abre `/dashboard` e confirma bloqueio em `/suspenso` e retorno ao painel após reativação. |
| Box retirado | Os seis cenários originais passaram com a nova expectativa. Os E2E verificam 404 nas páginas e 410 com `box_removed` nas APIs bloqueadas, sem cache, inclusive com a antiga flag do Box 2.0 ligada. Documentos, relatórios disponíveis e integrações públicas mantêm cobertura própria. |
| Seis departamentos | Revisão no Chromium em 1440 e 390 px. Jurídico, Controladoria, Atendimento, Comercial, Financeiro e Administração abriram com títulos e ações esperados. Os seis atalhos principais foram seguidos até o destino. A revisão verificou entrada móvel, busca global, Desktop, retorno à Ethos e acesso com perfil financeiro restrito. Foi usado um escritório novo, sem dados de produção nem conectores reais. |
| E2E completo | Revisão do QR: 72 de 73 passaram na execução completa com o build final. O teste restante verificava uma mensagem transitória do painel de administração. Após trocar a asserção pelo registro persistido e pela contagem de destinatários, os dois testes desse painel passaram no mesmo build. |
| Pilha de PRs | #17 tem base `main` e #18–#30 têm como base a branch do PR anterior. A ancestralidade dos commits publicados foi conferida e o GitHub marcou todos como mergeáveis. Os resultados de CI anteriores à revisão do QR não validam o novo commit. |

## Correções da Evolution

- Desktop e busca respeitam a permissão da Área de Trabalho.
- A visão geral de cada departamento fica disponível no menu mesmo quando o perfil não tem atalhos internos.
- O menu móvel da Ethos oferece entrada para a Evolution. A barra superior da Evolution acomoda os controles sem cortá-los.
- Atendimento filtra conversas vinculadas a processos que o perfil não pode consultar e respeita a permissão de leitura de clientes ao exibir nomes.
- Administração e Comercial ganharam espaçamento entre as seções identificado na revisão móvel.

## WhatsApp Web por QR

- O driver Baileys recebeu um QR real do WhatsApp Web em teste local. A sessão foi encerrada sem vincular um aparelho.
- O fluxo de teste do produto cobre exigência de 2FA, aceite do risco, exibição do QR, pareamento, troca e desconexão. O pareamento do teste automatizado usa o driver de teste.
- A conexão por QR exige 2FA, permissões de gestão e a chave de criptografia do servidor. O Box permanece desativado.
- Em homologação, abra **Atendimento → Configurar o Chat → Gerar QR-Code** e leia o código no WhatsApp do celular em **Aparelhos conectados**. Confira envio e recebimento com uma conversa de teste.

## Outras correções

- Os códigos de recuperação ficam na tela de ativação do 2FA até o usuário confirmar que os guardou.
- A sessão do PostgreSQL usa UTC para que as filas de e-mail e webhook respeitem o horário dos registros criados pelo Prisma.
- O botão da RUTE se afasta das ações da conversa quando o painel lateral está aberto no desktop.
- Os testes de IA, importação, tarefas, prospecção e páginas públicas acompanham os rótulos e as regras da versão atual.

Para reproduzir, use `npm run build` e `npm run test:e2e` com `DATABASE_URL` e `TEST_DATABASE_URL` apontando para um PostgreSQL isolado de teste. O projeto Chromium ativa a Evolution e o teste `src/tests/e2e/evolution.spec.ts` grava as 12 capturas em `test-results/`.

Nenhum merge ou deploy foi executado.
