# Chat e RUTE — atualização

- O painel de contexto da conversa permanece visível. Em telas grandes ele tem largura fixa de 400 px (440 px em telas maiores); no celular fica fixo abaixo da conversa. As abas exibem ícone e nome.
- Removidos o controle para retrair/abrir o painel, o diálogo móvel, o botão flutuante da RUTE e o acionador “Copiloto, macros e dados do atendimento”. Removidos o item de menu e a ação da RUTE na ficha do processo.
- `/rute` informa que o recurso está desativado. As APIs de exportação da RUTE respondem 410 para sessões autenticadas. O MCP e os serviços de assistente/propostas recusam operações enquanto o sinalizador de servidor `LEGALOS_RUTE_ENABLED` não estiver ligado; o padrão é desligado. Testes de integração habilitam esse sinalizador apenas no ambiente de testes.
- Validação local: compilação, TypeScript, ESLint e 18 testes de integração da RUTE passaram. O E2E da desativação passou, assim como os quatro E2E do WhatsApp, incluindo a conexão por QR já existente. Nenhum fluxo de conexão foi alterado.
- Aguardam revisão/CI e publicação.
