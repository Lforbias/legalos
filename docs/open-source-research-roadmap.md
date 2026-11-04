# Roteiro de pesquisa open source — LegalOS

**Estado:** backlog de pesquisa; nenhuma tecnologia abaixo foi instalada ou integrada por este registro.

**Objetivo:** estudar projetos e conceitos públicos, adaptar o que fizer sentido à arquitetura, ao contexto jurídico brasileiro e às necessidades do escritório, sem copiar código incompatível com as licenças.

## Como avaliar cada opção

1. Confirmar repositório oficial, atividade, licença e dependências transitivas.
2. Mapear o recurso para um problema real de FUNC, BOX, CHAT ou RUTE e verificar sobreposição com o LegalOS atual.
3. Ler arquitetura, segurança, privacidade, operação e custos antes de qualquer prova de conceito.
4. Para itens brasileiros, conferir cobertura real, fonte oficial, formatos, limites e tratamento de dados pessoais.
5. Registrar decisão (adotar conceito, testar isoladamente, acompanhar ou descartar), escopo mínimo, critérios de aceite e riscos. Só depois propor dependência ou implementação.

## FUNC — operação do escritório e experiência funcional

| Projeto / tecnologia | Linha de pesquisa | Pergunta para responder |
|---|---|---|
| React Flow | Fluxos visuais de processos, automações e departamentos | Um editor visual reduziria erros em automações sem expor regras complexas a quem só precisa operá-las? |
| Lexical | Editor rico para documentos, comentários ou comunicações | É possível adotar edição colaborativa/acessível sem comprometer exportação DOCX, histórico e segurança de conteúdo? |
| pg-boss | Filas persistentes com PostgreSQL | Quais tarefas atuais precisam de execução durável, repetição e observabilidade em segundo plano? |
| Activepieces | Automação visual e conectores | O modelo de peças/fluxos ajuda a ampliar integrações sem executar ações fora de limites, permissões e auditoria do LegalOS? |
| Brazilian Utils | Validação e formatação de dados brasileiros | O que já é coberto pelo código interno, qual licença se aplica e quais regras/documentos nacionais faltam? |
| Twenty | Referência de CRM moderno e extensível | Que padrões de contatos, atividades, funis e automações podem informar uma evolução do CRM próprio? |

## BOX — documentos, caixa e conectores judiciais

| Projeto / tecnologia | Linha de pesquisa | Pergunta para responder |
|---|---|---|
| Docling | Extração e estruturação de documentos | Qualidade em PDF jurídico brasileiro, tabelas, layout, execução local e proteção dos documentos sigilosos. |
| OCRmyPDF | OCR de PDFs pesquisáveis | Compatibilidade com o pipeline atual, idiomas, PDFs problemáticos, tempo e retenção de arquivos temporários. |
| PaddleOCR | OCR e reconhecimento de layout | Precisão em digitalizações brasileiras, requisitos de hardware, operação local e manutenção do modelo. |
| Crawlee | Automação/coleta web controlada | Limites éticos, termos de uso, CAPTCHA, auditoria e se há algum caso permitido sem contornar controles de acesso. |
| Querido Diário | Dados públicos brasileiros | Reuso de padrões de acesso a diários oficiais municipais; avaliar cobertura e separar isso de intimações judiciais do DJEN. |

## CHAT — comunicação e atualizações

| Projeto / tecnologia | Linha de pesquisa | Pergunta para responder |
|---|---|---|
| Chatwoot | Atendimento omnichannel e caixa compartilhada | Integração ou inspiração para histórico ligado a cliente/caso, permissões, consentimento e retenção. |
| Novu | Orquestração de notificações | Preferências, deduplicação, canais e templates para complementar notificações internas já existentes. |
| Evolution API | Integração com WhatsApp | Modelo de integração, estabilidade, riscos de sessão/banimento, privacidade e compatibilidade com a política do escritório. |

## RUTE — assistência e automação com IA

| Projeto / tecnologia | Linha de pesquisa | Pergunta para responder |
|---|---|---|
| Mastra | Construção de agentes e fluxos de IA | Como organizar ferramentas, estado e observabilidade mantendo confirmação humana para ações jurídicas. |
| Mem0 | Memória para sistemas de IA | Que memória útil pode ser isolada por escritório, corrigida, auditada e removida sem reter conteúdo excessivo. |
| Graphiti | Memória temporal em grafo | Se relações e mudanças no tempo ajudam em contexto jurídico, com rastreabilidade de fonte e prevenção de inferências falsas. |
| LiveKit Agents | Agentes de voz em tempo real | Casos de uso de voz, consentimento/gravação, latência e isolamento dos dados do atendimento. |
| sherpa-onnx | Reconhecimento/síntese de voz local | Qualidade em português brasileiro, execução offline e requisitos de aparelho/servidor. |
| Promptfoo | Avaliação e testes de sistemas de IA | Como criar casos de regressão, ataques e métricas para as ferramentas já existentes da RUTE. |
| LangGraph | Orquestração de fluxos de agentes | Se fluxos explícitos e recuperáveis agregam valor comparados aos serviços e controles atuais. |

## Ordem inicial de pesquisa

1. **Inventariar o que já existe:** conferir funcionalidades e dependências atuais antes de propor sobreposição.
2. **Baixo acoplamento:** Promptfoo, Brazilian Utils, OCRmyPDF e pg-boss (avaliar caso de uso e licenças; sem adicionar ao projeto nesta etapa).
3. **Experiência e operação:** React Flow, Lexical, Twenty, Chatwoot e Novu.
4. **Documentos e dados públicos:** Docling, PaddleOCR, Querido Diário e Crawlee, com amostras sintéticas e políticas de origem.
5. **IA e comunicação em tempo real:** Mastra, Mem0, Graphiti, LangGraph, LiveKit Agents, sherpa-onnx e Evolution API, após requisitos de privacidade e operação.

## Registro de decisão

Para cada estudo futuro, acrescentar data, versão/repositório consultado, licença, achados, risco, decisão e próximo passo. Não registrar como “implementado” até haver código próprio revisado e testes apropriados; não registrar como “funciona” sem evidência de execução real.
