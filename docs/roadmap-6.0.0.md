# LegalOS 6.0.0 — RUTE, a IA do LegalOS (MCP + aba de Inteligência Artificial)

Nome da IA: **RUTE** (definido pela Dra. Talita em 2026-10-21). A aba do menu e o assistente usam esse nome.

Origem: pedido da Dra. Talita em 2026-10-21. Duas frentes que andam juntas:

1. **Servidor MCP do LegalOS**: Claude, ChatGPT, Gemini e qualquer cliente compatível passam a consultar (e, com confirmação, propor ações) dentro do LegalOS, com as mesmas permissões de quem conectou.
2. **Aba própria "RUTE"** no menu principal (separada de Chat e Financeiro): o centro onde se conecta a IA, se vê o que ela fez e se conversa com um assistente embutido.

Decisões tomadas (2026-10-21): foco nas duas frentes; aba com assistente embutido **e** passo a passo para IAs externas; a IA **lê e propõe, e só grava com confirmação humana**; é um ramo novo (6.0.0), sem mexer nas fases restantes da 2.0. A F10 da 2.0 (IA com chave real) passa a ser entregue por esta versão.

## Base que já existe (não refazer)
- Chaves de API `lgos_…` com escopos, 2FA obrigatório para criar, auditoria e validade (`apikey.service.ts`, `docs/api.md`); API v1 de processos, clientes, prazos e intimações.
- IA por processo (`ai.service.ts`): interruptor por escritório, limite mensal de tokens, mascaramento de CPF/CNPJ, referências numeradas.
- Permissões granulares (`ai:use`), processos confidenciais, trilha de auditoria, limites por plano.

## Princípios (valem para toda a 6.0)
- Ler e propor; **nada é criado, alterado ou enviado sem confirmação de uma pessoa**. Nada fala com cliente.
- A IA age **como a pessoa que conectou**: mesmas permissões, mesmo sigilo de processo confidencial; perde acesso se a pessoa perder.
- Cada conexão e cada recurso tem interruptor liga/desliga por escritório; nasce **desligado**.
- CPF/CNPJ mascarados por padrão; texto das consultas fora da auditoria (só quem, quando e qual ferramenta).
- Sem chave real, o recurso avisa e fica desligado. Sem dados inventados; resposta sempre com referência ao registro de origem.
- Compatibilidade de cada IA externa (Claude, ChatGPT, Gemini) **conferida na documentação oficial na hora de construir**: o suporte a conectores remotos muda por plano e por versão.

## Fases

| Fase | Entrega | Depende de |
|---|---|---|
| 6.0-F1 | **Servidor MCP somente leitura** (`/api/mcp`, HTTP): ferramentas de busca e leitura de clientes, processos, andamentos, prazos, tarefas, intimações e agenda; autenticação por chave `lgos_` com escopos; limite de uso; auditoria; interruptor do escritório | só código |
| 6.0-F2 | **Conectar as IAs**: login com consentimento (OAuth) para conectores que exigem, tela com endereço e passo a passo para Claude, ChatGPT e Gemini, botão "testar conexão", lista de conexões ativas com revogar | F1; conferir docs de cada IA |
| 6.0-F3 | **Propostas com confirmação**: a IA propõe tarefa, prazo em rascunho, anotação ou minuta; vira item em "Aguardando confirmação"; quem confirma vê o que será criado, edita e aprova ou recusa; tudo auditado | F1 |
| 6.0-F4 | **Aba "RUTE"** no menu: situação (provedor, interruptores, uso do mês), conexões, propostas pendentes, histórico do que a IA consultou e fez | F2, F3 |
| 6.0-F5 | **Assistente embutido**: conversa dentro do LegalOS com o provedor escolhido (Claude, Gemini ou OpenAI, chave do escritório), usando as mesmas ferramentas do MCP; histórico por pessoa; respostas com referências | chave do provedor |
| 6.0-F6 | **IA nas telas**: botões no processo e no cliente (resumo, próxima providência, o que falta), abrindo o assistente já com o contexto | F5 |
| 6.0-F7 | **Biblioteca do escritório**: instruções e modelos salvos por área (previdenciário, trabalhista, cível), que o assistente e o MCP usam; pacote de skills para o Claude e orientações de uso | F5 |
| 6.0-F8 | **Governança**: limites por perfil e por mês, relatório de uso e custo, retenção das conversas, parada de emergência, LGPD (o que foi enviado ao provedor, por cliente) | F5 |
| 6.0-F9 | Ações de maior risco, uma a uma e sempre com confirmação: anotar andamento, preparar petição no padrão do escritório para revisão, preparar protocolo (nunca protocolar sozinha) | F3, F7 |

## Riscos e pontos de atenção
- **Sigilo profissional e LGPD**: conteúdo consultado sai para o provedor da IA. Exige consentimento do escritório, mascaramento e relatório do que foi enviado (F8).
- **Injeção de instruções**: textos de publicações e mensagens são dados, nunca comandos; a IA só grava via propostas confirmadas (F3), o que limita o dano.
- **Custo**: cada pessoa usa a própria IA (conta Claude/ChatGPT/Gemini) via MCP, ou o escritório paga o assistente embutido com limite mensal.
- **Cada IA externa tem limites próprios** (planos, aprovação do administrador do escritório). Conferir antes de prometer à equipe.

## Perguntas em aberto (responder antes da F2 e da F5)
- Quais IAs a equipe realmente usa hoje e em que plano (para priorizar o passo a passo)?
- Qual provedor será o padrão do assistente embutido e de quem é a chave?
- Quem aprova propostas: qualquer pessoa com permissão ou só advogado/controladoria?
