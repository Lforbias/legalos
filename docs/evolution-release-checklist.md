# LegalOS Evolution 1.0 — checklist de aceite

## Checkpoint atual — operações departamentais (PR #33)

- Revisão editorial de documentos implementada independentemente do Box: pedido, aprovação por outra pessoa, ajustes, histórico por versão e auditoria.
- Mesa operacional de tarefas integrada à Controladoria, com filtros, lista/quadro e alteração de situação persistente.
- Comercial permite selecionar cliente existente durante a conversão sem sobrescrever seu cadastro.
- Prévias do chat ocultam links de inscrição de autenticação.
- Validação: 1.353 testes de código aprovados; 25 testes focados do CRM e seis de revisão com Box desativado aprovados. Compilação final aprovada.
- Interface: primeira execução completa 72/73; o teste da Controladoria recarregava antes da resposta de gravação. Após ajustar a espera, os seis cenários finais de documentos, departamentos e CRM passaram, incluindo a persistência após recarga e o novo caso de conversão para cliente existente.
- Revisão visual da mesa de controle e navegação desktop/móvel realizada em escritório de teste. Sem validação de provedores externos reais.
- PR #33 foi integrado no commit `da2f796` e publicado pelo deploy `43310690679`; `/api/ready` confirmou banco, migrações e armazenamento ativos.
- **Evolution completa: NÃO APTA PARA HOMOLOGAÇÃO INTEGRAL.** Restam conferência/escalonamento formal, repasse Comercial→Jurídico/Financeiro, gestão por departamento e confirmação de toda a lista funcional. O aceite destes blocos não representa aceite integral.

Detalhes: `docs/evolution-department-workflows.md`.

## Atualização do Atendimento e desativação da RUTE

- O painel lateral do Chat fica fixo, mais largo e com abas nomeadas; o celular mostra o painel abaixo da conversa.
- Removidos o botão flutuante e os atalhos da RUTE, incluindo o acionador de copiloto/macros/dados e a ação na ficha do processo. Serviços e exportações da RUTE ficam bloqueados por padrão.
- Compilação, tipos, ESLint, 18 testes de integração e cinco E2E focados passaram. A checagem visual e de interface completa aguarda o CI deste segundo PR.
- A integração e o deploy dessa atualização ainda não foram feitos.

## Histórico de validações anteriores

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

Para reproduzir, use `npm run build` e `npm run test:e2e` com `DATABASE_URL` e `TEST_DATABASE_URL` apontando para um PostgreSQL isolado de teste. O teste `src/tests/e2e/evolution.spec.ts` grava as 12 capturas em `test-results/`.

Nenhum merge ou deploy foi executado.

## Interface única e cobertura funcional

A Evolution é carregada em todas as instalações e usa a mesma estrutura de navegação nas páginas departamentais e nos módulos internos, inclusive quando uma URL operacional é aberta diretamente. O resumo do escritório permanece acessível pelo menu da Evolution. O Portal externo e o LegalOS Desktop têm seus próprios layouts. O seletor de versões e os componentes da interface antiga foram removidos.

A conferência abaixo compara o escopo dos seis departamentos com as telas e serviços encontrados no repositório. A coluna de cobertura identifica implementação existente. O aceite de cada fluxo depende de teste funcional.

| Departamento | Cobertura encontrada | Pendências de aceite |
|---|---|---|
| Jurídico | Carteira com filtros por responsável, natureza e acervo. Ficha com partes, equipe, sigilo, linha do tempo, documentos e cálculos. Modelos, autotextos, timbrados e importação têm telas próprias. O serviço permite mudar a natureza de um caso para judicial no mesmo registro. | Validar a conversão de um caso com documentos e tarefas e conferir quais ferramentas estão acessíveis dentro da ficha. A área de preparação, revisão e aprovação de peças também está bloqueada pela retirada do Box. |
| Controladoria | Visão de pendências e Central de Alertas. Tarefas, prazos com validação e audiências existem nos módulos operacionais. | Conferência de conclusão, escalonamento e histórico como uma rotina integrada de Controladoria. Operação judicial permanece em reconstrução. |
| Atendimento | Conversas, filas, atribuições, etiquetas, notas, modelos, SLA, relatórios e painel com cliente, lead, processo, agenda e financeiro. Ações no chat criam lead, tarefa, prazo e compromisso e salvam anexos em Documentos, conforme as permissões. | Conferir o envio e recebimento com aparelho real e validar o fluxo completo de documentos, encaminhamento e aprovação de respostas entre áreas. |
| Comercial | Leads, funil, reuniões e retornos, propostas e conversão em cliente. | Registrar uma proposta como enviada atualiza o CRM. Entrega ao cliente e repasse da contratação ao Jurídico e Financeiro exigem validação própria. |
| Financeiro & Contábil | Lançamentos, parcelas, baixas, centros de custo, fluxo de caixa, honorários de êxito, faturas e cobrança. | Homologar a cobrança com o provedor configurado e validar rentabilidade por cliente, processo e departamento. Escrituração contábil completa está fora da cobertura atual. |
| Administração & Gestão | Membros, convites, perfis, 2FA, auditoria, equipe, metas, relatórios, automações e configurações de IA. | Validar supervisão, regras e indicadores consolidados por departamento com dados e perfis de homologação. |
