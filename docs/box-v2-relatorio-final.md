# LegalOS Box 2.0 — relatório final de entrega

Branch: `feat/box-v2` (alterações no diretório de trabalho, **ainda sem commit**). Nada foi publicado em produção. Data: 28/10/2026.

Este relatório separa três coisas que não podem se misturar: o que **funciona e foi provado por teste**, o que está **implementado mas nunca foi provado contra um tribunal real** e o que **não foi feito**. Onde algo depende de acesso que só você tem (servidor no Brasil, login do PJe, certificado), está dito.

## 1. Resumo em uma página

- O módulo Box foi reconstruído em camadas: contratos por capacidade, evidência, motor de sincronização, comunicação unificada, saúde e alertas, Caixa de Entrada com estados separados e atualização ao vivo, certificados com consulta e assinatura independentes e peticionamento com máquina de estados.
- O princípio foi seguido: o escritório gerencia o escritório; o LegalOS gerencia as integrações. As telas falam a língua do advogado; o detalhe técnico aparece só para quem administra integrações.
- **O Box 2.0 chega desligado.** Com a chave `LEGALOS_BOX_V2` ausente, o Box antigo roda como sempre (há teste automatizado). Voltar atrás = remover a variável e reiniciar. Dá para ligar **só para alguns escritórios** (piloto) com `LEGALOS_BOX_V2_ORGS`; a verificação de saúde e os avisos novos respeitam essa escolha. Roteiro de teste e publicação: `docs/box-v2-publicacao-e-teste.md`.
- **Duas regras de segurança valem sempre, com a chave ligada ou não** (certificados e peticionamento — seção 9). É uma decisão que você precisa conhecer.
- **Nenhuma integração com tribunal foi homologada contra um serviço real nesta entrega.** Tudo foi provado contra servidores simulados e fictícios (que o próprio sistema marca como "simulado" e nunca conta como prova). O que falta para provar de verdade está na seção 11.
- Resultado dos testes: 1.296 passam; 3 falham por motivo alheio ao Box (WhatsApp, dependem do horário do dia). Tipos, estilo e compilação de produção limpos.

## 2. Arquivos

Alterados (50, todos já existiam): `.env.example`, `playwright.config.ts`, `prisma/schema.prisma`, `scripts/server/install-cron.sh`; navegação e ajuda (`src/config/navigation.ts`, `ajuda/page.tsx`, `(dashboard)/layout.tsx`, `modulos/[key]/page.tsx`, `modules/help/guides.ts`); Box e Caixa de Entrada (`box/page.tsx`, `caixa-de-entrada/page.tsx`, `modules/inbox/notice-reader.tsx`, `notice-table.tsx`, `notice.service.ts`, `inbox-flow.service.ts`, `notice-bulk.service.ts`, `box.service.ts`); captura (`lib/djen/client.ts`, `djen.service.ts`, `job-runs.ts`, `api/cron/monitoring/route.ts`, `developer.service.ts`); robô do PJe (`lib/robots/pje/login.ts`, `server/robots/pje-runner.ts`, só diagnóstico sanitizado); certificados (`certificate.service.ts`, `modules/certificates/*`, `certificados/page.tsx`, `lib/permissions/catalog.ts` e `templates.ts`); peticionamento (`petition.service.ts`, `petition-queue.service.ts`, `mni.service.ts`, `mni-petition.service.ts`, `lib/petitioning/adapter.ts`, `document.service.ts`, `modules/petitions/*`, `modules/cases/schemas.ts`, `peticoes/page.tsx`, `peticoes/[id]/page.tsx`, `peticoes/fila/page.tsx`); `components/ui/alert.tsx` (passa a repassar `data-testid`); e os testes antigos `mni.test.ts`, `portal-robot.test.ts`, `legalmail-f5/f9/f10.test.ts`, `mni-petition.test.ts`.

Criados (71 arquivos): 3 migrações (seção 8); 3 documentos (`docs/box-v2-auditoria.md`, `-cobertura.md`, `-rollback.md`) mais este relatório; telas `/box/conexoes`, `/box/saude`, `/box/processos`, `/box/configuracoes`, `/box/configurar`; canal ao vivo `api/box/events`; `src/lib/features.ts` (chave); `src/lib/djen/adapter.ts`; camada `src/lib/judicial/*` (alerts, catalog, certificate-policy, communication, connection-state, contracts, evidence, health-policy, notice-state, petition-state, plain, robot-evidence); serviços `src/server/judicial/*` (box-cases, communication-ingest, connections, evidence, filing-gate, health, inbox-v2, live, notice-events, onboarding, overview, professional, sync-engine); componentes `src/modules/box/*` e `modules/petitions/reconcile-panel.tsx`; 9 arquivos de teste unitário, 8 de integração e 4 de navegador.

Removidos: nenhum.

Itens que já estavam soltos na sua pasta e **não são meus** (não mexi): `.backup-comercial-8.0/`, `repomix-output.xml`, `scripts/prospecting/export-amostra.ts`.

## 3. Mudanças de arquitetura

Detalhe em `docs/box-v2-auditoria.md`. Em resumo:

1. **Contratos por capacidade** (`contracts.ts`, `catalog.ts`): cada conector declara, capacidade a capacidade, o que implementa. "Declarado" nunca vira "comprovado".
2. **Evidência** (`evidence.ts`, tabela `connector_evidences`): toda checagem real grava ambiente (produção, homologação ou simulado), resultado e data; simulado nunca conta; evidência vence com o tempo.
3. **Estado da conexão derivado só de evidência** (`connection-state.ts`): Operacional, Parcialmente operacional, Necessita autorização, Autenticação expirada, Falha temporária, Não homologado, Indisponível. "Conectado por cadastro" deixou de existir.
4. **Motor de sincronização** (`sync-engine.ts`, `sync_runs`): uma execução por fonte, batimento, checkpoint por página, janela só avança com todas as páginas lidas e a contagem conferida, recuperação de execução interrompida.
5. **Comunicação unificada**: origem preservada (DJEN, intimação privada, movimentação), idempotência por fonte + identificador oficial, vínculo ao processo só quando o CNJ casa com um único processo.
6. **Saúde e alertas** com política por fonte; alerta abre uma vez, escala e se resolve sozinho; só administradores recebem aviso, sem segredos.
7. **Caixa de Entrada**: cinco estados que nunca se misturam (capturada, vista no LegalOS, ciência oficial, distribuída, tratada), linha do tempo e atualização ao vivo por eventos do servidor (sem Redis).
8. **Certificados**: consultar e assinar são poderes independentes; uma única política (`certificate-policy.ts`) decide.
9. **Peticionamento**: máquina de estados compartilhada entre tela e servidor, com tentativas, recibos e conferência por pessoa.

## 4. Telas reconstruídas (com a chave ligada)

Visão Geral, Caixa de Entrada (estados separados, filtros, atribuição, ações em lote seguras, linha do tempo, atualização ao vivo), Processos, Peticionamento (lista, fila, detalhe com recibo, tentativas e "Conferir no tribunal"), Conexões Judiciais, Operação e Saúde, Configurações e o assistente de configuração em 5 passos. Não há página "em breve": o que não existe não aparece.

## 5. O que opera de verdade, provado por teste

Provado em testes automatizados (integração, unidade e navegador), contra banco de testes real e servidores **fictícios**:

- Captura do DJEN com paginação, checkpoint e conferência do total; execução única por fonte; recuperação de execução parada; idempotência por identificador oficial.
- Estados da comunicação; "vista no LegalOS" nunca registra ciência oficial; atualização ao vivo (medida: ≈4,5 s em teste de navegador, meta ≤10 s).
- Estado da conexão e cobertura calculados só de evidência real; simulado nunca conta.
- Alertas (abrir, escalar, resolver, notificar só administrador).
- Certificados: política de consulta e assinatura, liberação com 2º fator e confirmação digitada, autorização por pessoa, auditoria, isolamento entre escritórios.
- Peticionamento: ambiente de teste nunca vira protocolo oficial; sem resposta do tribunal vira "Estado desconhecido" e não é reenviado; recusa definitiva permite reenvio; envio duplo simultâneo chega ao tribunal uma só vez; envio preso vira "desconhecido"; conferência exige recibo do mesmo processo; permissões e isolamento.
- Box 2.0 desligado: telas e API novas respondem 404 e o Box antigo segue igual.

## 6. Implementado, mas NÃO homologado em tribunal real

| Item | Situação |
|---|---|
| DJEN | Captura implementada e testada com servidor fictício. O DJEN recusa acessos de fora do Brasil: a verificação real precisa rodar no servidor brasileiro. Até lá a tela diz "sem verificação real". |
| PJe — MNI (consulta, avisos, autos, protocolo) | Só contra tribunal simulado. Exige habilitação do tribunal e liberação do IP. |
| PJe — portal com login do advogado | A validação de credencial existe; parou de funcionar no login real do TRF3/TJMG. A leitura das intimações do painel **não foi implementada**. |
| eproc, e-SAJ, PROJUDI | Parciais, via MNI onde houver. Sem robô de interface para o eproc. Webservices proprietários não suportados. |
| Protocolo real | Implementado com bloqueio: em produção só roda com evidência recente, não simulada, de envio aceito no mesmo conector e tribunal. Nenhum tribunal tem essa evidência ainda. |
| Certificado A1 | Consulta e assinatura separadas e testadas com certificados de teste. A3 e certificado em nuvem não são simulados nem suportados. |

Não implementado: Domicílio Judicial Eletrônico; conferência automática de uma petição em dúvida direto no tribunal (hoje é uma pessoa quem confere); leitura de intimações no painel do PJe pelo robô.

## 7. Resultados dos testes (28/10/2026)

| Verificação | Resultado |
|---|---|
| Suíte completa (unidade + integração, 178 arquivos) | **1.296 passam**, 9 ignorados, 3 falham |
| As 3 falhas | `f4-chat-40` (WhatsApp: aniversário, horário e campanhas). O teste usa a data em UTC e o sistema usa a do escritório; falha entre 21h e meia-noite de Brasília. Não tem relação com o Box e não foi alterado. |
| Testes ligados ao Box (20 arquivos) | 183 passam |
| Unidade (65 arquivos) | 405 passam, 9 ignorados |
| Navegador (Box 2.0 ligado e desligado, petições) | 5 passam (assistente + visão geral + conexões + saúde; Caixa de Entrada ao vivo; Box desligado; 2 de petições) |
| Navegador, specs antigos de documentos/petições | Passam quando o texto do cabeçalho é ajustado (ver abaixo) |
| Tipos (`tsc`), estilo (`eslint`), compilação de produção | Sem erro |

Observações honestas:

- **Specs de navegador antigos desatualizados.** Cerca de 35 specs aguardam um título "Olá" no painel e o cadastro de processo com o rótulo antigo; a tela atual diz "Bom dia" e "Título do caso ou processo". Já era assim antes do Box 2.0 (o painel e o menu não foram alterados por mim). Eles falham antes de chegar ao que testam. Não rodei todos; rodei, com cópia ajustada, os de documentos/petições (passam). O de certificados espera um link que hoje fica dentro do grupo recolhido "Conexões" do menu.
- O banco de testes do ambiente estava com fuso America/Detroit, o que desalinhava relógio do banco e do Node e derrubava testes de webhook e créditos. Troquei o fuso do banco de **teste** para UTC (como em produção). Isso não afeta produção.
- Não houve teste com tribunal real, certificado real nem DJEN real. Nenhuma meta de engenharia foi declarada sem teste: o único valor medido é o do canal ao vivo.

## 8. Migrações (só para frente, aditivas)

1. `20270106000000_box_v2_foundation` — tabelas `professional_identities`, `sync_runs`, `connector_evidences`, `health_alerts`, `notice_events`; colunas anuláveis em `court_notices` e `djen_monitors`; índices.
2. `20270107000000_box_v2_certificate_signing` — `certificates.signing_enabled_at/by`, `certificate_authorized_users.can_sign` (preserva o comportamento anterior para quem já estava autorizado) e a permissão `certificates:sign` para Titular e Administrador.
3. `20270108000000_box_v2_petition_filing` — três valores novos em `PetitionStatus` (`AWAITING_CONFIRMATION`, `FILED_CONFIRMED`, `UNKNOWN`), colunas em `petition_filings`, tabelas `petition_attempts` (com índice que impede duas tentativas abertas) e `petition_receipts` (um por petição).

O Postgres não remove valores de enum: o passo de volta atrás para petições está em `docs/box-v2-rollback.md` (SQL validado no banco de teste, dentro de transação desfeita).

## 9. Riscos de segurança e de operação

1. **Regras que não dependem da chave.** Mesmo com `LEGALOS_BOX_V2` desligada: (a) petição só vira "protocolada com confirmação oficial" com recibo de tribunal real, e sem resposta fica em "Estado desconhecido" sem reenvio; (b) protocolo real em produção exige conector homologado no tribunal; (c) consultar e assinar são poderes separados e certificados novos nascem "somente consulta". Consequência prática: quem protocolava de verdade pelo conector MNI passa a ser barrado até haver homologação (ou protocola no portal e registra o recibo aqui). Foi uma escolha deliberada: deixar a versão insegura acessível atrás da chave seria pior.
2. **Recibo registrado por uma pessoa** conta como confirmação, mas é atestado humano (guardado como "registrado por pessoa", com o documento do recibo). O sistema não consulta o tribunal para conferir.
3. **Migração de enum** não é desfeita: ver o SQL no rollback antes de reimplantar uma imagem anterior.
4. **Robô do PJe**: nunca contorna captcha, segundo fator ou bloqueio. O acesso do TRF3/TJMG ainda não funciona de ponta a ponta.
5. **Privacidade**: o canal ao vivo envia só "mudou" (sem conteúdo); o histórico mostra nomes só de pessoas do escritório; evidência técnica não carrega texto de publicação; nenhuma senha é registrada.
6. **Operação**: o agendamento de saúde roda a cada 5 minutos (reinstalar o agendamento). Sem a verificação real do DJEN a tela mostra "sem verificação real", não "operacional".

## 10. Dependências externas

- Servidor no Brasil para provar o DJEN.
- Habilitação e liberação do IP do servidor nos tribunais para MNI/PJe.
- Seu certificado A1 e o login do PJe (TRF3, TJMG, TRT15, TRT2) com uma pessoa para o segundo fator. Nenhuma credencial deve ser enviada por chat.
- Para TRF2 e TJSP (eproc): decidir entre MNI, robô de interface ou ambos.

## 11. O que falta antes de ligar em produção

1. Rodar a verificação real do DJEN pelo servidor no Brasil e registrar a evidência.
2. Reimplantar o robô do PJe com os diagnósticos, refazer o acesso do TRF3 e me trazer a saída para corrigir o login real; depois implementar a leitura das intimações do painel.
3. Homologar o protocolo (homologação do tribunal ou um protocolo oficial confirmado) por conector e tribunal.
4. Decidir sobre Domicílio Judicial Eletrônico e eproc.
5. Atualizar os specs de navegador antigos (ou aceitar que ficam desatualizados) e, se quiser, corrigir o teste de WhatsApp que depende do horário.
6. Ligar primeiro só para o seu escritório (`LEGALOS_BOX_V2_ORGS`) e, depois de validar, para todos (`LEGALOS_BOX_V2`).

## 12. Como publicar (só com a sua autorização)

1. Backup do banco (`docs/backup-restore.md`).
2. Commit na branch `feat/box-v2` e publicação como de costume (`docs/deploy-vps.md`). As migrações rodam sozinhas no início.
3. Reinstalar o agendamento: `scripts/server/install-cron.sh`.
4. Verificar o DJEN a partir do servidor no Brasil.
5. `LEGALOS_BOX_V2_ORGS=<id do seu escritório>` em `.env.production`; recriar o app; percorrer `/box/configurar`, `/box/conexoes` e `/box/saude`. O roteiro completo está em `docs/box-v2-publicacao-e-teste.md`.
6. Só depois decidir ligar para todos.

## 13. Como voltar atrás

Remover `LEGALOS_BOX_V2` e reiniciar: o Box antigo volta na hora, com todos os dados. As regras de certificado e peticionamento continuam valendo. Para reimplantar uma imagem anterior do código, rode antes o SQL de petições de `docs/box-v2-rollback.md`. Não é necessário apagar tabelas.
