# LegalOS Evolution 1.0 — checklist de aceite

## Checkpoint atual — estabilização publicada (PR #34)

- Main: `1a03702` (`feat(evolution): fixar painel do chat e desativar RUTE`). PR #34 integrado e publicado pelo deploy `43325427272`.
- CI desse commit: tipos, lint, Vitest, build e suíte E2E completos aprovados; Playwright reportou **74 testes aprovados em 4,1 min**, incluindo os 60 cenários anteriormente não executados. Execução: [CI 43325406791](https://github.com/Lforbias/legalos/actions/runs/43325406791).
- Prontidão em produção conferida em `https://www.legalossync.tech/api/ready`: banco, migrações e armazenamento retornaram `true`.
- As PRs #18–#30 foram conferidas como incorporadas ao `main` e fechadas como supersedidas; não reaplicar nem integrar a pilha antiga. PRs #19, #20, #26 e #28 já estavam fechadas.
- Alterações de interface e desativação da RUTE registradas abaixo. BOX continua desativado e suas rotas antigas seguem bloqueadas.
- **Decisão: APTO PARA HOMOLOGAÇÃO CONTROLADA; NÃO ACEITO COMO HOMOLOGAÇÃO INTEGRAL.** A equipe pode iniciar os testes práticos; aceite integral ainda depende dos itens manuais e funcionais listados abaixo.

## Histórico de operações departamentais (PR #33)

- Revisão editorial de documentos implementada independentemente do Box: pedido, aprovação por outra pessoa, ajustes, histórico por versão e auditoria.
- Mesa operacional de tarefas integrada à Controladoria, com filtros, lista/quadro e alteração de situação persistente.
- Comercial permite selecionar cliente existente durante a conversão sem sobrescrever seu cadastro.
- Prévias do chat ocultam links de inscrição de autenticação.
- Validação: 1.353 testes de código aprovados; 25 testes focados do CRM e seis de revisão com Box desativado aprovados. Compilação final aprovada.
- Interface: primeira execução completa 72/73; o teste da Controladoria recarregava antes da resposta de gravação. Após ajustar a espera, os seis cenários finais de documentos, departamentos e CRM passaram, incluindo a persistência após recarga e o novo caso de conversão para cliente existente.
- Revisão visual da mesa de controle e navegação desktop/móvel realizada em escritório de teste. Sem validação de provedores externos reais.
- PR #33 foi integrado no commit `da2f796` e publicado pelo deploy `43310690679`; `/api/ready` confirmou banco, migrações e armazenamento ativos.
- Este checkpoint documenta a entrega do PR #33. As pendências de aceite atuais estão consolidadas na tabela funcional ao final e continuam abertas quando dependem de validação manual ou fluxo que ainda não foi demonstrado.

Detalhes: `docs/evolution-department-workflows.md`.

## Atualização do Atendimento e desativação da RUTE

- O painel lateral do Chat fica fixo, mais largo e com abas nomeadas; o celular mostra o painel abaixo da conversa.
- A navegação na ficha do processo agora agrupa as seções em seis categorias; a revisão visual em tela desktop confirmou nomes legíveis, destaques e acesso às abas sem rolagem horizontal.
- Removidos o botão flutuante e os atalhos da RUTE, incluindo o acionador de copiloto/macros/dados, configurações, ajuda e fichas de processo/cliente. A tela de provedor exibe o aviso de indisponibilidade e não permite alterações. O Copiloto independente permanece disponível. Serviços e exportações da RUTE ficam bloqueados por padrão.
- Build, tipos, ESLint, teste unitário da ajuda, 18 testes de integração e nove E2E focados passaram, incluindo os fluxos atualizados de configuração desativada e navegação agrupada.
- PR #34 integrado e publicado. CI completo aprovado; ver checkpoint atual no início deste documento.

## Histórico de validações anteriores

**WhatsApp por QR pronto para testar com o aparelho do escritório.** A liberação depende da verificação do CI e da leitura do QR em homologação.

| Verificação | Evidência |
|---|---|
| Tipos, ESLint e build | Aprovados na revisão do QR. |
| Vitest completo | 188 arquivos e 1.368 testes aprovados na revisão do QR. |
| Superadmin | Cenário aprovado. A raiz pública já era reescrita para `/produto` na `main`. O teste agora abre `/dashboard` e confirma bloqueio em `/suspenso` e retorno ao painel após reativação. |
| Box retirado | Os seis cenários originais passaram com a nova expectativa. Os E2E verificam 404 nas páginas e 410 com `box_removed` nas APIs bloqueadas, sem cache, inclusive com a antiga flag do Box 2.0 ligada. Documentos, relatórios disponíveis e integrações públicas mantêm cobertura própria. |
| Seis departamentos | Revisão no Chromium em 1440 e 390 px. Jurídico, Controladoria, Atendimento, Comercial, Financeiro e Administração abriram com títulos e ações esperados. Os seis atalhos principais foram seguidos até o destino. A revisão verificou entrada móvel, busca global, Desktop, retorno à Ethos e acesso com perfil financeiro restrito. Foi usado um escritório novo, sem dados de produção nem conectores reais. |
| E2E completo | Histórico da revisão do QR: 72/73, com o cenário remanescente corrigido em execução focalizada. A suíte do commit atual foi executada depois e passou com 74/74. |
| Pilha de PRs | #17 e #18–#30 estão incorporadas no `main`; PRs #18–#30 foram fechadas como supersedidas. A confirmação de ancestralidade foi feita contra `origin/main`. |

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

O merge e deploy da versão corrente ocorreram antes deste checkpoint (PR #34, commit `1a03702`, deploy `43325427272`). Não houve novo merge ou deploy durante a atualização deste checklist.

## Interface única e cobertura funcional

A Evolution é carregada em todas as instalações e usa a mesma estrutura de navegação nas páginas departamentais e nos módulos internos, inclusive quando uma URL operacional é aberta diretamente. O resumo do escritório permanece acessível pelo menu da Evolution. O Portal externo e o LegalOS Desktop têm seus próprios layouts. O seletor de versões e os componentes da interface antiga foram removidos.

A conferência abaixo compara o escopo dos seis departamentos com as telas e serviços encontrados no repositório. A coluna de cobertura identifica implementação existente. O aceite de cada fluxo depende de teste funcional.

| Departamento | Cobertura encontrada | Pendências de aceite |
|---|---|---|
| Jurídico | Carteira por responsável, natureza e acervo; ficha com partes, equipe, sigilo, linha do tempo, documentos e cálculos; modelos, autotextos, timbrados, importação e revisão editorial com aprovação por outra pessoa. O Box e o protocolo judicial permanecem desativados. | Homologar em dados de teste a conversão de caso com documentos/tarefas e a revisão entre duas pessoas. Não usar Box nem presumir protocolo judicial disponível. |
| Controladoria | Central de Alertas e mesa operacional com filtros, lista/quadro e atualização persistente de tarefas; prazos e audiências ficam nos módulos existentes. | A rotina formal de conferência, conclusão, escalonamento e histórico não está integrada como fluxo próprio. |
| Atendimento | Conversas, filas, atribuições, etiquetas, notas, modelos, SLA, relatórios e painel contextual. Ações criam lead, tarefa, prazo e compromisso; anexos usam Documentos conforme permissões. A RUTE está desativada. | Testar aparelho real (QR) e fluxo real de documentos/encaminhamento/aprovação. Automação de pareamento usa driver de teste; ainda não prova envio/recebimento com número do escritório. |
| Comercial | Leads, funil, reuniões/retornos, propostas, mudança do lead para etapa de proposta quando enviada e conversão com escolha de cliente existente. | Testar entrega da proposta e registrar o repasse da contratação a Jurídico/Financeiro; os atalhos atuais abrem formulários reais, mas não comprovam handoff transacional entre departamentos. |
| Financeiro & Contábil | Lançamentos, parcelas, baixas, centros de custo, fluxo de caixa, honorários de êxito, faturas e cobrança. | Homologar cobrança com provedor real e conferir rentabilidade por cliente, processo e departamento. Escrituração contábil completa está fora da cobertura atual. |
| Administração & Gestão | Membros, convites, perfis, 2FA, auditoria, equipe, metas, relatórios, automações e configurações; indicadores respeitam permissões. | Validar regras de supervisão e indicadores departamentais com perfis/dados de homologação. |

### Pendências objetivas para fechar aceite integral

- Sessão prática por departamento, com perfis distintos e dados fictícios; registrar resultado e evidência no escritório de homologação.
- WhatsApp: ler QR com aparelho do escritório e verificar envio/recebimento. A produção está pronta, mas o aparelho não foi vinculado durante os testes automatizados.
- Financeiro: validar o provedor de cobrança configurado com uma operação de teste.
- Jurídico/Comercial/Financeiro: comprovar o repasse de uma contratação no fluxo real; hoje os atalhos levam aos módulos existentes.
- Controladoria: concluir, escalar e auditar uma pendência como fluxo formal. Gestão departamental e rentabilidade precisam de aceite com dados representativos.
- BOX e protocolo judicial ficam deliberadamente fora do aceite enquanto desativados; não habilitar para contornar as pendências.
