# Chat e RUTE — atualização

- O painel de contexto da conversa permanece visível. Em telas grandes ele tem largura fixa de 400 px (440 px em telas maiores); no celular fica fixo abaixo da conversa. As abas exibem ícone e nome.
- Removidos o controle para retrair/abrir o painel, o diálogo móvel, o botão flutuante da RUTE e o acionador “Copiloto, macros e dados do atendimento”. Removidos os atalhos da RUTE nas fichas de processo e cliente, nas configurações e na central de ajuda; o Copiloto de atendimento continua disponível como página independente.
- `/rute` informa que o recurso está desativado. As APIs de exportação da RUTE respondem 410 para sessões autenticadas. O MCP e os serviços de assistente/propostas recusam operações enquanto o sinalizador de servidor `LEGALOS_RUTE_ENABLED` não estiver ligado; o padrão é desligado. Testes de integração habilitam esse sinalizador apenas no ambiente de testes.
- Validação local: build, TypeScript, ESLint, teste de cobertura da ajuda, 18 testes de integração da RUTE e sete E2E focados passaram. Os E2E cobrem a desativação, ajuda em desktop/celular, navegação/configurações e quatro cenários do WhatsApp, incluindo o QR. Nenhum fluxo de conexão foi alterado.
- CI do PR #34 precisa ser repetido após a correção do teste de cobertura da ajuda; merge e publicação pendentes.
