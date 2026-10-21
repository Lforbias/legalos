# Do fluxo n8n + ChatGuru para o LegalOS Chat

Este documento registra, **sem chaves, telefones ou IDs**, o que o fluxo atual do escritório ("ChatGuru IA - versão padrão", 92 nós no n8n) faz e onde cada parte vive no LegalOS. Decisões confirmadas pela equipe em 2026-10-21.

## Mapa: n8n → LegalOS

| No n8n hoje | No LegalOS | Situação |
|---|---|---|
| Webhook do ChatGuru + número autorizado | WhatsApp conectado direto (Meta ou QR) e gravado na conversa | Já existe |
| Esperar 12 s e juntar mensagens | Mensagens entram na conversa em ordem; automações rodam por mensagem | Já existe (sem espera) |
| Menu 1/2/3 e palavras-chave de intenção | **Menu de triagem** (bot) com perguntas e ações | Já existe |
| Classificador de área (previdenciário, trabalhista, cível, outros) | **Triagem por área (modelo)**: regras de palavras-chave → fila e/ou atendente | **Novo (etapa 1)**, sem IA |
| Mapa área → advogada + diálogo no ChatGuru | Fila + atendente por área; "Outros" cai na fila padrão | **Novo (etapa 1)** |
| "Em atendimento humano?" (bot cala) | Quando uma pessoa responde, o menu se cala sozinho | Já existe |
| SLA de 15 min + aviso à advogada | **SLA de resposta** (aviso interno + e-mail, a qualquer hora) | **Novo (etapa 1)** |
| Cancelar o SLA quando humano responde | O alerta é calculado pelas mensagens: respondeu, não alerta | **Novo (etapa 1)** |
| Limpeza de conversas inativas | Conversas são mantidas (histórico do cliente); arquivar/fechar manual | Decisão: não apagar |
| Procura cliente na planilha do Google | Cadastro de clientes (já migrado do Astrea) | Já existe |
| Consulta DataJud + explica andamento | Processos e andamentos no sistema; IA entra na F10 | F10 |
| IA que conduz a triagem (uma pergunta por vez) | Rascunho de resposta **para aprovação humana** | F10 (precisa de chave) |
| Transcrever áudio, ler imagem/documento (Gemini) | Anexos ficam na conversa; leitura por IA | F10 |

## Regras confirmadas
1. Áreas: previdenciário → Dra. Marina; trabalhista → Dra. Natália; cível → Dra. Gléssia; outros → Dra. Talita. No LegalOS isso é configurado na tela **Configurações do Chat → Triagem por área** (escolher fila e atendente de cada área). As regras são criadas **desligadas**.
2. SLA: **15 minutos, a qualquer hora**. O padrão do sistema é 15 min; fica desligado até alguém ligar.
3. Aviso: **notificação interna e e-mail** (nada de WhatsApp pessoal).
4. Clientes: cadastro do LegalOS (importado do Astrea) e, se necessário, a planilha antiga na migração.
5. Resposta da IA ao cliente: **rascunho com aprovação humana**; envio direto só por decisão explícita, por área (F10).

## Problemas do fluxo antigo que o LegalOS não repete
- Chaves em texto puro dentro de nós (e uma chave repetida): no LegalOS os segredos ficam cifrados por escritório e nunca aparecem em tela.
- Telefone fixo como alternativa: o número sai sempre da conta cadastrada.
- Nó "Em atendimento humano?" com as duas saídas iguais e "Memória especialista" sem ligação: lógica comprovada por teste automatizado.
- Travas em "static data" e esperas (Wait) que se perdem ao reiniciar: o SLA é uma rotina agendada, idempotente (um alerta por mensagem do cliente).
- Sem botão de desligar nem auditoria: cada função tem interruptor e registro de quem ligou e quando.

## Como desligar o n8n com segurança
1. Etapa 1 no ar e testada (esta entrega); ligar o SLA e as regras de triagem em horário de baixo movimento.
2. Etapa 3 (F10): IA com aprovação humana, rodando **lado a lado** com o n8n por alguns dias.
3. Só então desativar o fluxo no n8n. **Antes disso: trocar a chave de API do ChatGuru**, que foi exposta no chat.
