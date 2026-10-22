# LegalOS 4.0.0 — plano (comparação com o ChatGuru)

Fonte: navegação SOMENTE LEITURA na conta do escritório no ChatGuru, em 2026-10-21. Nenhuma conversa foi aberta, nenhuma mensagem enviada, nada alterado. Chaves, telefones e identificadores NÃO são copiados para cá.

Telas percorridas: início, painel, funis, respostas rápidas, chatbots (diálogos e intenções), campanhas, fluxos, etiquetas, NPS, usuários (departamentos e rodízio), módulos, telefones, configurações da conta, relatórios (geral, usuários, mensagens, diálogos, notas, acessos, chats adicionados), gráficos e anexos. Ainda NÃO vistos: histórico de mensagens, dispositivos seguros e a tela de conversas (não abrir sem autorização).

## Tudo o que o ChatGuru tem (inventário)

### Atendimento
- C1. Caixa de conversas de WhatsApp com status de chat, atribuição a atendente e departamento, notas internas, menção a colega e encaminhar a vários chats.
- C2. Vários números de WhatsApp no mesmo painel, com tela de status e reconexão. Hoje há 2 números deslogados.
- C3. Departamentos e rodízio de distribuição por departamento (hoje todos vazios).
- C4. Arquivamento automático por inatividade e regras de status de chat (tela de configurações da conta).
- C5. Respostas rápidas.
- C6. Biblioteca de anexos/arquivos e checklists enviáveis dentro do chat.
- C7. Etiquetas com pré-definições por área, responsável e origem.
- C8. Funis (kanban de atendimento) ligados às conversas.

### Automação
- C9. Chatbots com diálogos de vários tipos: menu, horário/agendamento, aviso de audiência e perícia, aniversário, timer (reenvio após X minutos) e delegador (passa para o responsável certo).
- C10. Intenções com pontuação, para entender frase livre.
- C11. Fluxos (lista de fluxos de automação).
- C12. Campanhas: envio em massa com lista, agendamento e relatório de entrega.
- C13. NPS pós-atendimento.
- C14. API e chave de integração (usada hoje pelo n8n).

### Relatórios e gráficos
- C15. Relatório geral, por usuário, de mensagens (com status), de diálogos, de notas, de acessos e de chats adicionados.
- C16. Gráficos de tempo por etapa e por usuário; exportação de relatório, inclusive agendada.

### Conta e segurança
- C17. Módulos ligáveis por plano (tela de módulos).
- C18. Lista de IPs permitidos, logout automático e dispositivos seguros.
- C19. IA: transcrição de áudio e resumo de conversa.

## O que já temos e o que falta

| Item | Situação no LegalOS |
|---|---|
| C1 | Temos conversas, notas e atribuição; falta menção a colega e encaminhar a vários |
| C2 | Temos conta Meta e QR; falta painel de vários números com status/reconexão |
| C3 | Temos filas (rodízio, menor carga, manual) |
| C4 | Falta arquivamento automático e modelo de status |
| C5 | Temos |
| C6 | Falta biblioteca de arquivos e checklists no chat |
| C7 | Temos etiquetas; faltam pré-definições por área/responsável/origem |
| C8 | Falta (entra com o Kanban da 2.0-F3) |
| C9 | Temos menu; faltam os demais tipos de diálogo |
| C10 | Falta (depende de IA, 2.0-F10) |
| C11 | Temos automações com gatilhos e ações |
| C12 | Falta (WhatsApp cobra por modelo: só com autorização humana e chave liga/desliga) |
| C13 | Falta (2.0-F9) |
| C14 | Temos API e webhooks |
| C15 | Temos SLA, indicadores e alertas; faltam relatórios de mensagens, status, acessos e chats adicionados |
| C16 | Faltam gráficos por etapa/usuário e exportação agendada |
| C17 | Falta (junto da página de planos) |
| C18 | Falta (2.0-F11) |
| C19 | Falta (2.0-F10) |

## Fases sugeridas (4.0)

| Fase | Entrega | Origem |
|---|---|---|
| 4.0-F1 | Etiquetas pré-definidas por área/responsável/origem; menção a colega; encaminhar a vários chats | C1, C7 |
| 4.0-F2 | Biblioteca de arquivos e checklists enviáveis no chat | C6 |
| 4.0-F3 | Vários números no mesmo painel com status e reconexão | C2 |
| 4.0-F4 | Status de chat e arquivamento automático por inatividade | C4 |
| 4.0-F5 | Bot 2.0: diálogos de horário, audiência/perícia, aniversário, timer e delegador | C9 |
| 4.0-F6 | Relatórios de atendimento: mensagens, status, acessos, chats adicionados, tempo por etapa e usuário, exportação agendada | C15, C16 |
| 4.0-F7 | Campanhas em massa controladas (autorização humana, chave liga/desliga, relatório de entrega) | C12 |
| 4.0-F8 | NPS pós-atendimento | C13 |
| 4.0-F9 | Intenções com pontuação, transcrição de áudio e resumo por IA (chave real, aprovação humana) | C10, C19 |
| 4.0-F10 | Módulos por plano e segurança da conta (IPs, logout automático, dispositivos) | C17, C18 |
| 4.0-F11 | Completar com o que aparecer nas telas ainda não vistas (histórico de mensagens, dispositivos seguros) | — |

Regras que valem para toda a 4.0: nada envia mensagem a cliente sem autorização humana; toda automação tem chave liga/desliga; cobrança pelo WhatsApp continua desligada até a Dra. Talita autorizar. Parte dos itens (C8, C13, C18, C19) já está na 2.0.0 e só sai daqui quando a 2.0 for entregue.

## Estado (2026-10-21)
F1 a F10: **feitas** (migração `20261216000000_chat_4_0`, testes em `f4-chat-40.test.ts`). F11: **a fazer** (depende das telas ainda não vistas do ChatGuru). Transcrição de áudio usa Gemini (2 créditos por áudio) e só foi testada contra simulador. Detalhes e limites em `docs/implementation-status.md`.
