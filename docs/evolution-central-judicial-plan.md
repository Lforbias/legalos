# Evolution — Central Judicial

## Objetivo

Reunir publicações, dados e movimentações judiciais no Jurídico do LegalOS. A caixa de entrada organiza o trabalho da equipe; a ficha de cada processo mantém seu histórico, com origem e tipo de informação identificados.

Processos administrativos estão fora do escopo atual. A reconstrução do BOX antigo não será reativada. O acesso privado aos tribunais continua sendo prioridade e será desenvolvido na etapa 5, em conjunto com o usuário.

## Ordem aprovada

1. **Base da ferramenta:** aproveitar processos, permissões por escritório, auditoria e caixa de entrada existentes.
2. **DJEN:** disponibilizar publicações consultadas pela API pública, preservando conteúdo, datas, certidão e origem.
3. **DataJud:** complementar a ficha do processo com metadados e movimentações; não tratar DataJud como publicação ou autos completos.
4. **Integração por processo:** exibir publicações e movimentações na ficha, além da caixa de entrada; manter origem, deduplicação e estado de tratamento.
5. **Acesso privado:** próximo bloco de alta prioridade, um sistema por vez, com credenciais protegidas, autenticação adicional e evidência de funcionamento. Parar antes de iniciar esta etapa e trabalhar junto com o usuário.
6. **Autos completos e peticionamento:** etapa posterior, condicionada à validação de cada integração e confirmação humana para ações com efeito externo.

## Estado do trabalho

- **Etapas 1–4 implementadas no código; validação focada e compilação de produção aprovadas.** A Evolution tem uma tela de publicações DJEN, cada processo ganhou a aba Publicações, e itens sem vínculo podem ser ligados manualmente por alguém com `cases:write`.
- Advogados com permissão para editar processos podem cadastrar o nome, número e UF da OAB em Integrações e iniciar uma consulta pública do DJEN. DataJud segue separado: consulta por número CNJ do processo e requer chave do escritório.
- O feed público usa apenas registros identificados como DJEN, filtra por escritório e aplica a visibilidade de processos sigilosos. Não usa `inbox:read`, a antiga caixa do BOX ou endpoints de acesso privado.
- DataJud já sincroniza movimentos para a linha do tempo; a tela agora identifica esses eventos como “DataJud · CNJ”.
- **Checkpoint:** `src/server/services/public-judicial.service.ts`, `src/modules/judicial/public-notice-link.tsx`, `src/modules/judicial/public-notice-link-actions.ts`, `src/app/(evolution)/evolution/juridico/publicacoes/page.tsx`, `src/app/(dashboard)/processos/[id]/page.tsx`, `src/app/(evolution)/evolution/juridico/page.tsx`, `src/config/evolution-navigation.ts`, `src/app/(dashboard)/integracoes/page.tsx`.
- **Validação focada:** 36 testes passaram (14 unitários DJEN/comunicações e 22 de integração DJEN, DataJud, Central Judicial e permissões). Os 2 E2E focados de integrações passaram após atualizar a expectativa antiga sobre a tela DJEN. ESLint, typecheck e `npm run build` também passaram na branch limpa baseada em `main`.
- **Build de produção:** concluído com sucesso. O Next reportou avisos existentes de rastreamento dinâmico de arquivos em `/api/ready` e no serviço de armazenamento; não impediram o build.
- **Validação real:** não foi feita consulta ao serviço DJEN/DataJud com credenciais/configuração de produção. A captura foi exercitada com resposta DJEN sintética em banco de teste.
- **Pendências conhecidas:** esta tela exibe o estado de captura, mas não altera estado de tratamento nem atribui responsável; processos precisam existir no LegalOS para o vínculo manual. O agendamento depende do ambiente. O CI completo está sendo repetido após atualizar um E2E antigo que proibia a tela DJEN; falta concluir esse CI, publicar e confirmar funcionamento no site.
- Já existem serviços e modelos de dados para monitoramento DJEN, DataJud, comunicações e processos. Reutilizar após conferir permissões e estado real; não assumir que cadastro antigo comprova captura funcional.
- Não incluir processos administrativos.
- Não habilitar login privado, não consumir filas de login e não iniciar peticionamento nesta etapa.
- Não habilitar acesso privado, peticionamento nem alterar dados de produção como parte desta entrega.

## Critérios para concluir as etapas 1–4

- A entrada da ferramenta fica no departamento Jurídico, sem recriar Controladoria.
- Cada informação na caixa e na ficha do processo indica sua fonte e tipo.
- Publicações e movimentações ligam ao processo certo; itens sem vínculo ficam para revisão.
- DataJud não é apresentado como fonte de publicação nem de autos completos.
- Falhas de consulta são visíveis e não aparecem como resultado vazio bem-sucedido.
- A etapa 5 permanece parada para trabalho conjunto.
