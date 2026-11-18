# NEW FEATURES — LegalOS Evolution

> Backlog de novas funcionalidades aprovado em 17/11/2026.
> **Status geral: PLANEJADO — não implementado nem validado em produção.**
> Fonte de referência para respostas futuras a "o que temos para fazer no LegalOS?".
> Os quatro projetos de referência mantêm a ordem aprovada. Novas iniciativas próprias do LegalOS são registradas separadamente, sem alterar essa ordem.

## 1. Docassemble — automação de documentos (prioridade 1)

**Referência:** https://github.com/jhpyle/docassemble  
**Objetivo:** adicionar um motor de formulários/entrevistas inteligentes e geração de documentos (DOCX/PDF), integrado às entidades já existentes do LegalOS, sem substituir a plataforma.

**Funcionalidades desejadas**
- Modelos de contratos, procurações, declarações, petições padronizadas e formulários.
- Entrevistas guiadas e perguntas condicionais com validação.
- Pré-preenchimento com clientes/partes/processos já cadastrados no CRM/Jurídico.
- Geração versionada de DOCX/PDF, registro de autoria e histórico auditável.
- Revisão e aprovação humana; armazenamento no processo/cliente; integração posterior a assinatura.
- Acionamento por eventos interdepartamentais, com autorização e visibilidade adequadas.

**Primeiro piloto (dados fictícios):** cliente no CRM → entrevista para contrato de honorários → DOCX/PDF → revisão por advogado → anexação ao cadastro/processo.

**Abordagem:** avaliar implantação do Docassemble como serviço separado, com integração via API/adaptador; preservar autenticação, permissões e multiempresa no LegalOS. Verificar desempenho, segurança, isolamento de dados e condições da licença MIT.

**Critério de aceite:** fluxo demonstrável ponta a ponta, sem copiar dados entre telas manualmente, com logs, versionamento e revisão obrigatória.

**Status:** A fazer.

## 2. Mike — IA jurídica e revisão documental (prioridade 2)

**Referência:** https://github.com/open-legal-products/mike  
**Objetivo:** inspirar a camada LegalOS Intelligence, vinculando agentes jurídicos a documentos, processos e serviços do produto.

**Funcionalidades desejadas**
- Pesquisa e respostas fundamentadas nos documentos autorizados, com referências conferíveis.
- Análise de contratos, comparação de versões, sugestões e revisão tabular.
- Fluxos reutilizáveis de revisão e elaboração de minutas.
- Conectores MCP, integração com Google Workspace/Word quando apropriado.
- Aprovação explícita para operações que modificam, compartilham ou enviam dados.
- Logs, rastreabilidade de fonte, limites de acesso, prevenção de vazamento entre escritórios e avaliações de qualidade.

**Primeiro piloto:** selecionar documentos fictícios de um processo, perguntar sobre pontos-chave e gerar relatório revisável com citações e trilha de auditoria.

**Abordagem:** avaliação funcional/técnica e protótipo isolado; **não incorporar código do Mike diretamente antes de revisar a AGPL-3.0 e obrigações aplicáveis ao SaaS**. Avaliar arquitetura e reimplementar conceitos com componentes próprios/licenciados adequadamente.

**Critério de aceite:** respostas com origem rastreável, controle de acesso do escritório, revisão humana para conclusões jurídicas e aprovação antes de ações de escrita.

**Status:** A fazer.

## 3. Juriscraper — padrões arquiteturais para o LegalOS Box (prioridade 3)

**Referência:** https://github.com/freelawproject/juriscraper  
**Objetivo:** aproveitar padrões de coleta, normalização, testes por fonte e observabilidade para tornar o Box mais confiável, sem assumir que a ferramenta suporta tribunais brasileiros.

**Funcionalidades desejadas**
- Adaptadores independentes por tribunal/motor (PJe, Eproc, e-SAJ), com versões e capacidades identificadas.
- Agendador e fila persistente de processos a conferir, tentativas controladas e retomada segura.
- Extração e normalização de metadados e movimentações; comparação idempotente com o banco.
- Logs por tribunal e motor, códigos de erro estruturados, métricas e relatórios do Modo Dev.
- Alertas para alterações reais e encaminhamento aos módulos de Processos/Prazos/Atendimento.
- Autenticação permitida, sessão persistente quando autorizada, tratamento de OTP/certificado e intervenção humana quando exigida.
- Preservar fontes públicas como DJEN e DataJud em paralelo.

**Limites:** Juriscraper é voltado a tribunais dos EUA; **não fornece integração pronta com PJe/Eproc/e-SAJ**. Não prometer bypass de CAPTCHA, nem listar MNI como disponível sem acesso autorizado.

**Primeiro piloto:** um tribunal/motor em ambiente de testes, com dados permitidos, resultado normalizado, diff entre capturas, logs e notificação validada.

**Critério de aceite:** fluxo real verificável, sem duplicação de movimentações, com erros diagnosticáveis e sem necessidade de testes manuais constantes.

**Status:** A fazer.

## 4. E-Discovery — evidências e gestão documental avançada (prioridade 4)

**Referência/catálogo:** https://github.com/ishandutta2007/Awesome-Ediscovery  
**Ferramentas a avaliar:** IPED (https://github.com/sepinf-inc/IPED), Paperless-ngx (https://github.com/paperless-ngx/paperless-ngx), FreeDiscovery (https://github.com/FreeDiscovery/FreeDiscovery).

**Objetivo:** explorar capacidades para um futuro módulo LegalOS Evidence e fortalecer o acervo de documentos, respeitando a necessidade concreta dos escritórios.

**Funcionalidades desejadas**
- OCR e busca por conteúdo de documentos, PDFs e e-mails.
- Classificação e etiquetagem; processamento em lote e deduplicação.
- Pesquisa de evidências, agrupamento de arquivos relacionados e metadados preservados.
- Hashes, proveniência, cadeia de custódia, auditoria de acesso e exportação.
- Vinculação de evidências a clientes, casos, processos e responsáveis.

**Primeiro piloto:** pequeno conjunto fictício de documentos e mensagens com OCR, busca, agrupamento e identificação de duplicidades.

**Abordagem:** avaliar cada dependência e sua licença separadamente; usar serviços especializados apenas quando comprovarem valor e desempenho. Não substituir o GED atual precipitadamente.

**Critério de aceite:** acervo pesquisável, com origem e integridade verificáveis, sem violação de permissões entre escritórios.

**Status:** A fazer.

## Iniciativa transversal — LegalOS Welcome (cadastro, assinatura e ativação)

**Natureza:** melhoria própria do LegalOS, separada das quatro prioridades de repositórios externos listadas acima.  
**Status:** Planejado — não implementado nem publicado.  
**Objetivo:** oferecer a melhor primeira experiência possível para novos usuários, desde a apresentação da plataforma até contratação, personalização do escritório e primeira ação de valor, aproveitando o cadastro, o sistema de organizações e a cobrança existentes.

### Jornada proposta (cinco etapas)

**1. Boas-vindas e identificação do profissional**
- Tela de apresentação clara, profissional, com indicação do progresso.
- Nome completo, e-mail, senha segura e verificação de e-mail; telefone se necessário para contato/ativação.
- Perfil: advogado autônomo, escritório ou departamento jurídico empresarial.
- Entrada de colaboradores por convite existente, sem exigir nova contratação.
- Possibilidade futura de login social, somente após implementar e validar OAuth.

**2. Perfil e diagnóstico do escritório**
- Nome fantasia, razão social, CPF/CNPJ quando necessário, OAB/UF quando aplicável, localização e fuso.
- Áreas de atuação, equipe, volume estimado de clientes/processos, ferramenta anterior e principais dores.
- Perguntas condicionais e dados não essenciais opcionais; pedir informações sensíveis só quando justificadas.
- Pré-configurar módulos e sugestões de importação conforme o perfil.
- Salvar progresso entre sessões para permitir retomar o cadastro.

**3. Ativação comercial: três caminhos distintos**
- **Assinatura:** escolher um dos planos oficiais, conferir valores e limites, preencher faturamento, contratar por Asaas (Pix, boleto ou cartão via provedor) e acompanhar confirmação.
- **Código de presente/acesso:** código individual ou campanha que concede plano, dias de acesso, descontos temporários, benefício de parceria ou acesso especial; consultar e mostrar claramente benefícios e vencimento *antes* de resgatar.
- **Teste gratuito:** avaliação de 14 dias conforme política publicada, com condições transparentes e sem cobrança automática inesperada.
- Separar **código de permissão para cadastrar** (REGISTRATION_MODE/code atual) de **código comercial de benefício**, que ainda precisa ser desenvolvido.
- Códigos comerciais devem ter limite de usos, vigência, escopo, regras de cumulatividade, exclusão de resgate duplicado, trilha de auditoria, revogação e validação no servidor.
- Nunca ativar assinatura paga ao término de um presente/teste sem consentimento claro de contratação.

**4. Configuração inicial personalizada**
- Apresentar opções guiadas: organizar processos, configurar atendimento/WhatsApp, financeiro, importar dados, convidar equipe.
- Reaproveitar os departamentos e recursos existentes; não criar um segundo cadastro de cliente, processo ou escritório.
- Orientar integração de serviços sem apresentá-los como ativos antes de uma conexão verificada.
- Permitir pular etapas não essenciais.

**5. Primeiro acesso e checklist de ativação**
- Desktop personalizado com checklist contextual: primeiro cliente, primeiro processo, primeiro colaborador, documentos e atendimento, conforme o perfil.
- Tutoriais curtos, ajuda contextual e indicadores de progresso persistidos no banco.
- Não bloquear uso normal até finalizar o checklist; evitar pop-ups excessivos.
- Medir início/conclusão de cadastro, abandono por etapa, seleção de plano, pagamento confirmado, código resgatado, primeira ação relevante e ativação da equipe.

### Welcome 2.0 — complementos aprovados (seleção: ideias 4, 3, 5, 6, 7 e 8)

**Status:** aprovados para o backlog; **ainda não implementados**. São melhorias da iniciativa transversal LegalOS Welcome, **não** novos itens na ordem das quatro prioridades principais. A proposta de *Setup AI* (ideia 1) e de nova *migração inteligente* (ideia 2) desta rodada **não foi selecionada**. Isso não elimina melhorias de importação já planejadas no produto.

**4. Central de presentes e convites especiais**
- Administração cria códigos individuais e campanhas com benefícios explícitos: dias/meses gratuitos, acesso a plano específico, desconto por período e parceria; modalidades especiais somente com autorização.
- Painel para criar, suspender, revogar e consultar códigos; vigência, máximo de resgates, elegibilidade por e-mail/organização, limite de usos por escritório, regras de acúmulo e histórico auditável.
- No cadastro, prévia do que o código concede e de quando expira; resgate atômico e idempotente, prevenindo fraude, reutilização e corridas.
- Separar convites de colaboradores, código que permite cadastrar (`REGISTRATION_MODE`) e código que concede benefícios de assinatura. Nenhuma cobrança posterior sem consentimento.

**3. Escritório de demonstração interativo**
- A pessoa experimenta o LegalOS com clientes, processos, tarefas, documentos e relatórios **inteiramente fictícios** e claramente sinalizados.
- Ambiente isolado do escritório real (base/tenant demo segregado e sem acesso cruzado), sem disparar WhatsApp, e-mail, cobrança, monitoramento judicial ou efeitos externos.
- Alternância simples entre demonstração e ambiente real; oferecer um roteiro de tarefas e permitir sair sem deixar dados fictícios na operação produtiva.
- Expiração/limpeza segura e controle de consumo de recursos para impedir abuso.

**5. Implantação colaborativa**
- O proprietário convida os membros do escritório no onboarding e delega etapas por área: Jurídico (processos), Financeiro (cobrança), Atendimento (canais), Administração (equipe).
- Reutilizar convites, papéis e permissões existentes; convidado não contrata outra assinatura.
- Checklist compartilhado com responsável, situação, data de conclusão, bloqueios e auditoria; sem dar poderes administrativos automaticamente a convidados.

**6. Índice de prontidão do escritório**
- Indicador de implantação calculado a partir de evidências reais (cadastros, documentos, membros, configurações e testes de conexão) com estados **Não iniciado / Pendente / Configurado / Verificado / Requer atenção**.
- Não chamar uma integração de “funcionando” apenas por existir cadastro/credencial; checagem real de conectividade e resultados quando suportada.
- Mostrar o próximo passo recomendado, critérios explícitos e detalhes por departamento; evitar percentual artificial ou afirmações de prontidão sem validação.

**7. Concierge de implantação**
- Ajuda contextual para dúvidas de cadastro, contratação, importação e conexão de serviços, com abertura de pedido de suporte e opção de agendar acompanhamento **quando houver canal/equipe disponível**.
- Relatório diagnóstico compartilhável com consentimento, contendo estados, códigos de erro e contexto necessário, **nunca** senhas, tokens, certificados privados ou documentos sigilosos.
- Histórico de atendimento e encaminhamento para o departamento responsável; suporte não obtém acesso irrestrito aos dados do escritório.

**8. Painel de conversão e ativação**
- Funil administrativo: visitantes que iniciaram cadastro → conta verificada → escritório criado → caminho comercial escolhido → pagamento confirmado/código resgatado → primeira ação de valor → equipe ativada.
- Métricas de desistência por etapa, tempo até primeiro valor, planos escolhidos, códigos/campanhas utilizados e conclusão do onboarding, com filtros temporais e segmentação agregada.
- Eventos confiáveis e deduplicados; distinguir teste, presente e assinatura paga; controles de acesso e privacidade, retenção proporcional e não registrar senhas, conteúdo jurídico ou dados de pagamento sensíveis.

**Integração com as fases já planejadas:** o escritório demo e convites colaborativos entram no desenho da **Fase A**; a central de presentes amplia a **Fase B**; prontidão, concierge e painel de métricas integram a **Fase C**. Priorizar experiências reais e verificadas, com testes isolados e sem interromper os fluxos de cadastro atuais.

**Aceite adicional:** um usuário novo explora demo sem tocar dados reais; outro resgata um presente com histórico auditável; proprietário convida equipe e delega configuração; índice não marca conexão falsa como verificada; suporte recebe diagnóstico sem segredos; painel mostra métricas coerentes com eventos de teste.

### Estado da base e adaptações previstas

- Fluxo existente: `/register`, `/onboarding`, autenticação de conta, criação de organização e convites.
- Atualmente `createOrganization` abre assinatura `TRIALING` de 14 dias com `TRIAL_PLAN_KEY="profissional"`; reconciliar esse padrão com os planos comerciais oficiais Simples, Básico, Intermediário e Avançado, sem mudar benefícios implicitamente.
- O código de cadastro sob `REGISTRATION_MODE=code` é apenas um controle de acesso, não um cupom.
- Asaas já tem código de integração para assinatura/faturas e webhooks, mas a documentação relata ausência de comprovação de ciclo real no sandbox/provedor; homologar antes de cobrar em produção.
- Fonte de preços/benefícios deve ser única para landing page, checkout, cobrança e limites efetivos; não exibir plano indisponível como contratável.
- Cobrança deve distinguir `checkout iniciado`, `pagamento pendente`, `pagamento confirmado`, `benefício gratuito vigente`, `expirado` e `cancelado`. Webhooks idempotentes e reconciliação com o provedor são obrigatórios.
- Segurança: autenticação, rate limiting, e-mail validado, 2FA conforme políticas, antiabuso de códigos, multiempresa, LGPD, auditoria e recuperação de sessões.
- A implementação não pode interromper escritórios e assinaturas existentes.

### Ordem recomendada de entrega

1. **Fase A — Cadastro Premium:** UI em etapas, diagnóstico do escritório, persistência de progresso, personalização e convites sem fricção.
2. **Fase B — Checkout e Presentes:** consolidar planos, validar Asaas em sandbox, checkout guiado, regras de cupons e resgates, e cobertura de falhas/reentradas.
3. **Fase C — Ativação Guiada:** checklist contextual, importação assistida, tutoriais, métricas de conclusão e melhoria da conversão.

**Piloto de aceite:** dois escritórios fictícios percorrem os caminhos de assinatura sandbox e presente; um terceiro entra como membro convidado. Conferir isolamento, retomada de sessão, ausência de cobrança não autorizada, assinatura/código aplicados corretamente e conclusão de uma primeira ação relevante.

**Status:** A fazer.

## Iniciativa transversal — LegalOS Cowork (colaboração entre pessoas e agentes)

**Nome aprovado:** LegalOS Cowork — Collaborative Workspace.  
**Decisão:** substitui integralmente o conceito anterior de **LegalOS Team**. Não é somente um chat interno: é o ambiente de trabalho compartilhado do escritório, preparado para colaboração futura entre profissionais e agentes de IA.  
**Natureza:** iniciativa estrutural própria do LegalOS Evolution, independente do Welcome e das quatro prioridades externas acima.  
**Status:** **Cowork 1.0 e 2.0 implementados e testados na branch `claude/cowork` (PR aberto, não publicado). Videoconferência desativada por falta de infraestrutura/credenciais; agentes de IA não implementados.** Detalhes técnicos em `docs/cowork.md`.  
**Princípio:** primeiro estabilizar a experiência humana e os fluxos entre departamentos; somente depois adicionar agentes consultivos e evoluir gradualmente sua autonomia.

### Visão e experiência

- Um **workspace por escritório/organização**, com isolamento multiempresa e identidade unificada da conta existente.
- Canais públicos e restritos por departamento (Geral, Comercial, Atendimento, Jurídico, Financeiro, Gestão etc.), conversas individuais, grupos e salas ligadas a processos ou projetos.
- Usuários exibidos pelo nome profissional/de exibição associado à conta, com papel e departamento; **não** criar credenciais paralelas nem usar necessariamente o nome de login como nome público.
- Chat interno separado do atendimento/WhatsApp com clientes, com navegação integrada e sem cruzar mensagens privadas ou destinatários.
- Mensagens em tempo real, respostas em threads, @menções, notificações, pesquisa, anexos e compartilhamento contextual de recursos.
- Encaminhamento de **links/cartões de clientes, processos, pastas, documentos, tarefas e atividades** em vez de duplicar registros. Acesso ao conteúdo continua sujeito às permissões originais e ao sigilo de processos.
- Reuniões internas (meetings) agendadas e vinculadas a canais, tarefas, processos e calendário; áudio/vídeo e compartilhamento de tela entram mediante avaliação de solução técnica, segurança, custos e capacidade, sem presumir implementação existente.
- Reuniões podem gerar atas, encaminhamentos e tarefas com responsáveis, prazos, aceite e histórico.
- Um espaço pode reunir profissionais humanos e, **em etapa futura**, agentes departamentais claramente identificados como IA.

### Colaboração com agentes de IA (visão futura, não implementar antes da base estável)

- **Comercial/CRM:** agente especializado em leads, propostas, triagem e apoio às respostas; eventual atendimento por mensagem/voz condicionado a integração habilitada, consentimento e regras de operação.
- **Atendimento:** agente especializado em canais, encaminhamento e rascunhos de respostas.
- **Jurídico:** agente especializado em documentos, casos, pesquisa e preparação de minutas, com fontes rastreáveis e revisão profissional.
- **Financeiro:** agente especializado em cobranças, honorários, pendências e relatórios, respeitando permissões de finanças.
- Interação natural por @menções: pessoas podem consultar agentes específicos; um agente pode requisitar colaboração a outro, **sem ampliar automaticamente seu acesso**.
- Agentes são atores diferentes de usuários humanos: identificador, escopo, permissões mínimas, trilha de auditoria, limites e possibilidade de suspensão/revogação próprios.
- Operações externas ou de escrita (responder cliente, alterar cadastro, movimentar documentos, enviar cobrança, agendar ou peticionar) exigem políticas explícitas de autorização e, quando pertinente, aprovação humana.
- Mensagens, ações, propostas, aprovações, resultados e falhas ficam rastreáveis; nenhuma alegação de execução sem confirmação real.

### Gestão e acompanhamento de trabalho (tracking)

- O gestor visualiza **o trabalho**, não apenas o volume de mensagens: responsáveis, tarefas em curso, atrasos, bloqueios, entregas, horas registradas, reuniões e pendências por departamento.
- Integração com o que já existe no LegalOS: tarefas, agenda, apontamentos de tempo, relatórios de produtividade, permissões, auditoria e documentos.
- Converter uma mensagem/reunião em tarefa e relacionar uma tarefa a uma conversa sem gerar cadastros duplicados.
- Estados de trabalho com atualização vinculada a eventos reais; diferenciar `Em andamento`, `Aguardando`, `Concluído` e `Não informado`. Não inferir atividade real só por presença online.
- Painel gerencial com filtros por equipe/período/processo e critérios explicáveis. Nenhuma leitura indiscriminada de mensagens diretas privadas, vigilância oculta ou pontuação de produtividade baseada em quantidade de chats.
- Canais e arquivos confidenciais são visíveis apenas a membros autorizados; administradores não recebem acesso irrestrito por padrão.

### Implantação incremental aprovada

1. **Cowork 1.0 — Humanos:** comunicação interna em tempo real, canais, grupos, DMs, menções, links a recursos existentes, anexos, permissões e reuniões básicas (integração de conferência após estudo técnico).
2. **Cowork 2.0 — Gestão e operação:** mensagens/reuniões vinculadas a tarefas e processos, atas e encaminhamentos, registros de progresso, visões por departamento e indicadores administrativos baseados em entregas verificáveis.
3. **Cowork 3.0 — Inteligência consultiva:** adicionar agentes por departamento para responder perguntas e preparar propostas, com acesso restrito, fontes verificáveis e intervenção humana.
4. **Cowork 4.0 — Colaboração híbrida:** agentes colaboram com pessoas e outros agentes em fluxos entre departamentos, com orquestração controlada, aprovações, observabilidade, reversibilidade e limites explícitos.

**Dependência obrigatória:** seguir a estratégia Evolution — departamentos/UX → funcionalidades → integração de fluxos → testes e estabilização → agentes/IA. A IA não deve bloquear a entrega e adoção do Cowork humano.

### Arquitetura, segurança e critérios de aceite

- Preservar o monólito modular, entidades de organização/membros, controle de acesso e trilhas existentes; não recriar plataforma, chat externo, calendário, tarefas, CRM ou GED.
- Serviços e modelos específicos do Cowork para canais, participantes, mensagens, reuniões e referências; vincular a `organizationId` e checar permissão também no acesso direto a anexos/cartões.
- Comunicação em tempo real com entrega ordenada, reconexão, notificação, histórico persistente e controles antiabuso; definir transporte conforme estudo técnico da infraestrutura atual.
- Limites de armazenamento/transferência, verificação de arquivos, retenção adequada, proteção de dados e logs sem conteúdo sensível desnecessário.
- **MVP com dados fictícios:** dois usuários autorizados conversam em um canal, compartilham uma pasta/processo sem vazamento de sigilo, criam tarefa de uma mensagem, realizam ou agendam reunião e geram encaminhamento; gestor acompanha a entrega sem acesso indevido à DM privada.
- **Fase de agentes posterior:** um agente consultivo responde apenas dentro de seu escopo; solicita autorização para qualquer ação modificadora e gera trilha íntegra.
- Não anunciar áudio/vídeo, colaboração interagentes ou automação de mensagens como disponíveis antes de testes end-to-end e validação da infraestrutura.

**Status:** Em revisão — 1.0/2.0 implementados (PR), vídeo desativado, agentes não iniciados.

## Regras de execução

1. Preservar o repositório e as funcionalidades existentes; não reconstruir o LegalOS do zero.
2. Integrar cada funcionalidade aos departamentos e fluxos reais (Comercial → Jurídico/Documentos → Financeiro → Atendimento) quando fizer sentido.
3. Validar no ambiente de desenvolvimento com dados fictícios e fluxo ponta a ponta antes de publicar.
4. Tratar licenciamento, segurança, segregação multiempresa, LGPD, auditoria e aprovação humana como requisitos obrigatórios.
5. Não confundir "planejado" com "implementado"; atualizar o status aqui apenas após entrega e testes verificáveis.
6. Ao perguntar **"o que temos para fazer?"**, recuperar este arquivo e apresentar os quatro projetos nesta ordem, além do **LegalOS Welcome** e do **LegalOS Cowork** como iniciativas transversais e das demais pendências do LegalOS quando solicitado.

## Resumo rápido

| Ordem | Projeto | Entrega-alvo | Status |
|---|---|---|---|
| 1 | Docassemble | Geração e revisão de documentos integrada ao CRM/Jurídico | A fazer |
| 2 | Mike | IA jurídica fundamentada em documentos e com aprovações | A fazer |
| 3 | Juriscraper | Arquitetura robusta para conectores e monitoramento do Box | A fazer |
| 4 | E-Discovery | OCR, busca, deduplicação e cadeia de custódia | A fazer |

**Iniciativas adicionais (fora da ordem dos quatro projetos):**
- LegalOS Welcome — cadastro premium, assinatura/código de presente e ativação guiada — A fazer.
- LegalOS Cowork — espaço de colaboração interno com pessoas, reuniões, gestão do trabalho e agentes departamentais no futuro — Em revisão (1.0/2.0 implementados e testados; vídeo e agentes pendentes).
