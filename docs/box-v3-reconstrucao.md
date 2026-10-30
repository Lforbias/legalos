# Reconstrução do LegalOS Box 3.0

Atualizado em 29/10/2026. Este documento acompanha a inspeção do LegalMail e a primeira entrega de leitura da reconstrução no aplicativo.

## Estado atual

- O Box anterior permanece retirado. `BOX_AVAILABLE=false` continua bloqueando as rotas, APIs, credenciais e rotinas judiciais antigas.
- A prévia do Box 3.0 (`/box-v3`) aparece em desenvolvimento local ou com `LEGALOS_BOX3_PREVIEW=1` e exige as permissões existentes para cada área. Além da consulta, permite registrar explicitamente uma abertura interna da comunicação.
- Entregues na prévia: visão geral, caixa por pastas com busca, filtros e detalhe, lista de conexões, gestão local de credenciais/certificados no cofre com MFA e sem dados secretos na resposta, monitoramento de evidências e alertas (com reconhecimento interno), histórico de sincronizações, fila de protocolos com ciclo interno de rascunho/revisão e cadastro manual de processos por número CNJ. Guardar ou conferir credenciais não acessa os tribunais.
- As novas consultas aplicam organização e visibilidade por sigilo. Abrir a tela não grava marca de leitura; o registro interno só ocorre após clique e não altera ciência oficial. A consulta de conexões retorna apenas metadados e evidências sanitizadas; não consulta credenciais cifradas, senhas ou chaves privadas. As listas não expõem cursores, payloads, conteúdo de recibos ou mensagens de erro brutas.
- Os registros anteriores são apresentados como históricos. Há ações internas explícitas para vincular a processo visível, registrar abertura, distribuir a uma pessoa ou equipe cujos integrantes tenham acesso ao processo, vincular uma peça documental do mesmo processo, adicionar notas e etiquetas, adormecer/despertar, devolver à Entrada e marcar/reabrir o tratamento da comunicação, com trilha de auditoria e sem efeito no tribunal. A partir de uma comunicação aberta, o usuário também pode iniciar uma tarefa vinculada à origem ou abrir o formulário de prazo em rascunho, que exige conferência e validação humana; tarefas e prazos já criados aparecem relacionados no detalhe da comunicação conforme as permissões. A triagem por regras prepara resumo e minuta editável; a validação é explícita e pode criar um prazo em rascunho. A caixa filtra por tipo, origem, leitura interna e ciência oficial. A fila permite criar/editar rascunhos e anexos do mesmo processo, enviá-los para revisão, aprovar internamente, devolver com orientação ou cancelar e criar uma cópia em rascunho. Importações V3 validam números CNJ e cadastram processos no LegalOS, com vínculo de cliente opcional; consulta DataJud, atualização de andamentos e download de autos não são chamados. Revisão/aprovação não agenda nem envia petição. Não executa robôs, não consulta tribunais, não dá ciência processual, não sincroniza nem baixa autos e não envia petições.
- A aprovação interna exige permissão de aprovação e leitura de documentos; a pessoa revisora pode abrir as versões fixadas no envio para revisão. Nomes de documentos ficam ocultos para quem não tem permissão de leitura.
- Não houve migração de dados, alteração de credenciais, mudança em `.env` nem publicação.

## Observações diretas da interface do LegalMail

- A Entrada separa itens novos e acervo, oferece estados e filtros de leitura e mostra áreas distintas para detalhes do processo e da movimentação. Há um controle manual de atualização, que não foi acionado.
- A tela de sistemas mostra advogado, sistema, estado, data e origem da atualização. O painel tinha 25 vínculos: 21 habilitados e 4 com pendências; a aba de desabilitados estava vazia. O alerta da Entrada chamava os quatro de temporariamente desabilitados, uma diferença de rótulo que o Box deve evitar.
- O Monitoramento divide publicações do DJEN, DJe do STF, intimações eletrônicas e movimentações. As regras de intimações associam sistema e certificado. A tela informa consulta periódica para movimentações e que processos em segredo de justiça não são monitorados por essa função.
- Importações, downloads, rascunhos e protocolos têm filas próprias. As colunas observadas incluem estado, responsável e horários; a fila de protocolos também prevê certificado e datas de protocolo/cancelamento.
- A conta tem uma tela própria de verificação em duas etapas. A interface consultada não mostrou uma página de gerenciamento de certificados; as telas de monitoramento, importação e protocolo fazem referência a certificados.
- O app mostra atribuições de atualização como Automação e Suporte. Isso comprova o que a interface exibe, não se a implementação usa API, navegador remoto, operador ou combinação desses meios.

Nenhum processo, cliente, teor de intimação, chave de API, senha, certificado ou chave privada foi aberto para esta análise.

## Decisões de produto

1. Um cadastro antigo nunca basta para mostrar “conectado”. O Box deve mostrar o que foi testado, quando e para qual operação.
2. Captura de publicação, intimação eletrônica, movimentação, leitura de autos e protocolo são capacidades independentes.
3. Caixa, monitoramento e filas precisam separar situação interna do LegalOS e efeitos confirmados pelo tribunal.
4. Uma resposta incerta de protocolo não pode gerar reenvio automático. O status deve pedir conferência humana e manter o recibo associado.
5. PJeOffice e certificados locais exigem prova em ambiente autorizado. A inspeção do LegalMail não comprova que Playwright remoto funcione com um PJeOffice instalado no computador do advogado.
6. Integração sem caminho autorizado continua como operação assistida, com o portal oficial, em vez de simular automação.

O repositório confirma que a extensão LegalOS PJe atual usa permissões de aba/script e não declara `nativeMessaging`. Seu escopo é OTP assistido no navegador e captura de CNJs visíveis. Portanto ela não é um agente local do PJeOffice; a ponte nativa não está implementada nem pode ser inferida da inspeção do LegalMail.

## Etapas propostas

1. **Casca, conexões e visão geral em leitura** — entregue em `/box-v3`; expõe os registros preservados como históricos.
2. **Caixa V3 e fluxo interno** — entregue com pastas, pesquisa, filtros por tipo/origem/leitura/ciência, paginação, detalhe, histórico, vinculação manual a processo visível, notas e etiquetas internas e marcos separados de captura, leitura interna, ciência oficial e distribuição. Abrir a tela não grava estado; vincular, marcar como aberta, distribuir para uma pessoa ou equipe, adicionar nota/etiqueta, adormecer/despertar, devolver à Entrada e marcar/reabrir tratamento são ações explícitas que não têm efeito no tribunal. Atribuição respeita a visibilidade do processo para cada integrante.
3. **Monitoramento e sincronização** — histórico de evidências e execuções paginado; cada execução tem detalhe com período, contagens, cobertura e evidências/alertas relacionados, sem cursor ou erro técnico bruto. Uma pessoa com `integrations:manage` pode encerrar um registro `RUNNING` que ultrapassou o limite de heartbeat do motor; isso não retoma nem inicia sincronização. Ainda falta reimplementar a execução autorizada com checkpoint, deduplicação por identificador oficial, contagem/paginação conferida e diagnóstico por sistema e operação.
4. **Conector local piloto** — validar navegador, PJeOffice, autenticação e consulta autorizada em uma única instância, sem protocolo de produção.
5. **Filas de protocolo e importação** — fila interna de rascunhos/revisão/aprovação, registro assistido de reconciliação manual de estado incerto e cadastro manual de lotes por CNJ disponíveis. Ainda faltam importação autorizada de tribunal, atualização de andamentos/autos e recuperação controlada.
6. **Peticionamento** — rascunho, anexos, revisão, aprovação interna, devolução com orientação, cancelamento interno com cópia em rascunho e conferência manual de estado incerto estão disponíveis na V3, com versões de documentos conferidas e trilha de auditoria. A conferência exige permissão de aprovação e leitura de documentos, protocolo e recibo do processo para marcar como protocolada, ou justificativa de consulta manual para marcar ausência; não contata o tribunal nem libera reenvio V3. Homologação específica continua pendente. Agendamento e envio real continuam bloqueados; eventual liberação depende de homologação por tribunal e confirmação humana no momento do envio.

## Bloqueios externos para operação real

- Credenciais válidas e autorizadas por escritório/tribunal e um certificado de teste sob controle do escritório, sem copiar segredos para logs ou ferramentas de inspeção.
- Ambiente de homologação e uma instância de tribunal definida para o primeiro piloto; a interface do LegalMail não demonstra compatibilidade técnica com o PJeOffice local.
- Validação ponta a ponta da captura, cobertura, recibos, idempotência e estados incertos antes de habilitar qualquer mutação. O fluxo de produção depende de aprovação humana a cada envio.
- OAuth próprio do escritório para Google Drive/Docs quando o fluxo F3b for usado fora dos simuladores.

Cada etapa é liberada separadamente; nenhuma variável antiga liga os fluxos judiciais retirados.

## Entrega: fundação Box 3.0 + DataJud ponta a ponta (30/10/2026)

Branch `feature/box-3-foundation` (ainda sem merge). Detalhe completo em `docs/box-v3/ARCHITECTURE.md`, `docs/box-v3/REPOSITORY_AUDIT.md`, `docs/box-v3/LICENSE_AUDIT.md` e `docs/box-v3/CONNECTOR_MATRIX.md`.

- Auditados os 12 repositórios de referência do prompt mestre (incluindo JuriScraper e peticionamento_pje, por pedido explícito da titular, separando o que é aproveitável do que é contorno de CAPTCHA — ver `docs/box-v3/audit/*.md`). Nenhum código sem licença permissiva ou sob AGPLv3 foi copiado; só conceitos, sempre reimplementados.
- Criada a fundação `src/lib/box-v3/core` (reexporta contratos/catálogo/evidência já existentes) e o orquestrador `src/server/judicial/orchestrator.ts` (`runCapability`): primeiro ponto único que liga uma chamada real de conector à gravação de evidência de funcionamento.
- O conector DataJud (consulta pública por CNJ) foi desacoplado de `BOX_AVAILABLE` — essa chave é do Box autenticado retirado (PJe/eproc/certificados), e o DataJud nunca teve relação com os problemas que motivaram a retirada. Antes, `assertBoxAvailable()` escondia até o cartão de configuração em Integrações mesmo com chave própria cadastrada. Agora `syncCaseFromDatajud`/`testOrgDatajud` gravam evidência real via `runCapability`, que já aparece sozinha na tela Box 3.0 → Monitoramento (a consulta ali já lia a tabela `ConnectorEvidence` por `organizationId`, sem filtrar por conector).
- Novo endpoint `GET /api/box/v3/capabilities` (sessão + `inbox:read` + prévia habilitada): cruza o catálogo com a evidência real recente.
- Verificação: `tsc --noEmit` e `eslint` limpos nos arquivos tocados/novos. Testes unitários novos (`src/tests/unit/box-v3-orchestrator.test.ts`) escritos, mas **não executados** nesta sessão — o `vitest` desta VM de automação não roda aqui (binário nativo do `rolldown` ausente, o mesmo problema já registrado em `docs/box-v3-estado.md`); precisam rodar no Mac. Testes de integração (banco) e E2E também dependem do Mac (sem Postgres nesta VM).
- Nada do Box autenticado (PJe, eproc, certificados, MNI, sessões, peticionamento, ingestão do DJEN na caixa) foi alterado — continua exatamente como estava, atrás de `BOX_AVAILABLE` ou da prévia `/box-v3`.

### Próximo conjunto de alterações

1. Rodar no Mac: `npm run test:unit` (confirmar os testes novos do orquestrador) e a suíte de integração/E2E já pendente da sessão anterior.
2. Contratos e infraestrutura dos conectores autenticados PJe/eproc (sem declarar operação alguma pronta antes de homologação real) — próxima entrega.
3. Commit desta fundação na branch `feature/box-3-foundation`.
