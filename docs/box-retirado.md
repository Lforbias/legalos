# Retirada provisória do LegalOS Box

Decisão da titular em 29/10/2026: retirar o Box do produto em uso para reconstruir a integração judicial. A ponte assistida do PR #8 não faz parte desta entrega.

## Produto e execução

- `BOX_AVAILABLE=false` é uma decisão de código; as antigas flags `LEGALOS_BOX_V2` e `LEGALOS_BOX_V2_ORGS` não reativam o módulo.
- Navegação, atalhos, permissões operacionais, caixa de entrada, peticionamento, certificados, credenciais e telas de conexão judicial são retirados do uso. Func, Chat, Desktop, tarefas, agenda, documentos e financeiro continuam disponíveis.
- Acesso direto às rotas retiradas retorna 404; APIs e rotinas do Box retornam 410 no proxy. Os serviços também recusam operações, inclusive chamadas por Server Actions ou ferramentas RUTE/MCP/API.
- MNI, PJe, fila de protocolo, autos e monitoramento ficam suspensos. O worker não reserva trabalhos nem abre navegador. O roteiro de publicação para o contêiner `robot` em vez de construí-lo/reiniciá-lo. A consulta pública do DataJud e o cron público do DJEN são integrações compartilhadas e continuam disponíveis fora da área do Box.
- Novas chaves não podem conceder escopos do Box; chaves existentes não obtêm esses acessos. Google, API geral, webhooks não judiciais, WhatsApp e tarefas/prazos manuais permanecem.
- Gatilho `NOTICE_RECEIVED` e webhooks de intimação/petição não executam. Entregas antigas ficam sem envio, sem apagar a fila. Notificações que levam a páginas retiradas não são exibidas.
- O ZIP da extensão deixa de ser distribuído. Uma extensão antiga ainda instalada não consegue enviar à API retirada. A titular pode desativá-la em `chrome://extensions`.
- A apresentação comercial e o catálogo de recursos deixam de oferecer o Box. Registros históricos de versões e auditoria continuam como história, não como disponibilidade.

## Dados preservados

Não há migração destrutiva, remoção de tabelas, exclusão de comunicações, processos, tarefas, documentos, certificados ou conexões. As configurações anteriores continuam armazenadas, porém inoperantes. Código antigo fica isolado para permitir consulta histórica e reconstrução; isso não é a implementação de um novo Box.

## Publicação

Merge e publicação aguardam a confirmação escrita exigida pela titular. Nenhuma variável nova, chave, senha ou acesso ao conteúdo de `.env.production` é necessário para esta retirada. Ao publicar, conferir `/api/ready`, Func, Chat e as rotas bloqueadas. Confirmar que o contêiner `robot` parou. A titular pode executar `/opt/legalos/scripts/server/install-cron.sh` para conferir/reinstalar o agendamento sem rotinas judiciais.

## Atualização de 10/11/2026 — preparação do Box 9.0

- O acesso ao Box antigo continua bloqueado. A prévia `/box-v3` também foi desligada em todos os ambientes, inclusive desenvolvimento, e suas rotas diretas, API e ações ficam indisponíveis.
- A rota agendada do DJEN e a consulta pública do DataJud permanecem fora do bloqueio do Box, pois são integrações compartilhadas. MNI, PJe, peticionamento, robôs judiciais, autos e certificados permanecem suspensos.
- Os arquivos de telas e serviços antigos e as tabelas/migrações históricas foram mantidos no repositório. O mapeamento confirmou dependências com registros de comunicações, processos, documentos, certificados e integração compartilhada; removê-los junto das telas apagaria caminhos de leitura e poderia comprometer histórico. A retirada de código pode ser feita em etapa própria, após inventário por dependência e cobertura de dados.
- Criada a branch local `backup/antes-desativar-box-20261110` apontando para o estado anterior às alterações desta preparação.

## Reconstrução

O futuro Box precisa de especificação e validação próprias: autenticação no servidor, tratamento legítimo de segundo fator, coleta completa por tribunal, deduplicação por identificador oficial, checkpoint, agendamento, observabilidade e teste com navegador local fechado. Não reativar o código antigo nem apresentar importação manual como monitoramento automático.

Em 29/10/2026 começou a prévia do Box 3.0 em `/box-v3`. Ela lia os cadastros preservados e permitia ações internas explícitas, sem alterar ciência oficial. Desde 10/11/2026 a prévia está desligada em todos os ambientes; `LEGALOS_BOX3_PREVIEW=1` não a reativa. A consulta pública DataJud/DJEN permanece independente.

## Testes

Os testes novos `unit/box-retirement.test.ts` e `integration/box-retirement.test.ts` usam a política real de retirada, inclusive para provar que titular não acessa o Box e que monitores/registros não são alterados. As regressões históricas de domínio usam um mock explícito de disponibilidade somente no setup do Vitest para continuar testando o código isolado. Isso não é variável de ambiente nem caminho de reativação no aplicativo. Os testes novos de retirada não usam esse mock. Testes antigos de navegador que esperam telas do Box precisam ser atualizados para a ausência do módulo.
