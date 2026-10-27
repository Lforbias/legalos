/**
 * Novidades e andamento do LegalOS, mostradas no painel do developer (aba "Novidades e andamento").
 * MANTER EM DIA a cada entrega: acrescente a entrega em RELEASES, mude o status da fase em PHASES e, se for o caso, riscar a ação em TEAM_TODO.
 * (Espelha CHANGELOG.md e docs/roadmap-*.md, que não vão na imagem de produção.)
 */
export type PhaseStatus = "feita" | "em andamento" | "a fazer";

export type Release = { id: string; when: string; title: string; items: string[]; migration?: string };

/** Mais recente primeiro. */
export const RELEASES: Release[] = [
  {id:"rute-desktop-memoria-voz",when:"2026-10-27",title:"RUTE no Desktop, memórias pessoais e voz pelo navegador",migration:"20261231000000_rute_memories",items:["RUTE integrada à pasta do Desktop, com seleção dos processos recentes visíveis e histórico pessoal separado por contexto, sem sair da área de trabalho.","Memórias salvas explicitamente, pessoais ou vinculadas ao cliente/processo, com revisão, remoção do contexto futuro, isolamento por usuário e retenção da governança. Não há aprendizagem ou gravação automática de preferências.","Ditado em português para revisão antes do envio e leitura da resposta pelo navegador. Microfone exige ativação explícita, para ao fechar/trocar contexto e não envia comandos sozinho. Compatibilidade e processamento local/remoto dependem do navegador.","Consultas e ações seguem permissões, modo selecionado e idempotência. Voz contínua, palavra de ativação e integração com notebooks ainda não fazem parte desta entrega."]},
  { id: "produto-precos-definidos", when: "2026-10-26", title: "Produto: valores e limites dos quatro planos", items: ["Página comercial atualizada com Simples R$ 79/mês (2 usuários, 150 processos), Básico R$ 149/mês (5 usuários, 500 processos), Intermediário R$ 349/mês (10 usuários, 1.000 processos, 1 número WhatsApp) e Avançado R$ 599/mês (20 usuários, 2.000 processos, 2 números WhatsApp).", "Percentuais que dependiam de preço ChatGuru não confirmado não foram anunciados. A mudança é da página pública; não reajusta assinaturas nem muda os limites operacionais existentes."] },
  { id: "produto-co-founders", when: "2026-10-26", title: "Produto: páginas dos co-founders", items: ["Página pública /produto/fundadores com Luiz Felipe de Oliveira Roweder Bernardes, Talita Silva de Brito e Arthur Camilo da Silva, todos identificados como Co-founder.", "Fotografias fornecidas pelo usuário, perfis individuais, links entre os perfis e destaque na página Sobre. Sem cargos adicionais ou biografias inferidas."] },
  { id: "produto-precos-comparativo", when: "2026-10-26", title: "Produto: preços públicos, comparativo e estrutura de quatro planos", items: ["Nova página /produto/precos com preços e condições de LegalMail, ADVBOX, Astrea e ChatGuru, fontes e data de consulta. Recursos não confirmados não são tratados como ausentes.", "Catálogo pesquisável de 300 recursos e operações granulares, com referências de implementação. Não são 300 módulos nem garantia de inclusão em todos os planos.", "Planos Simples, Básico, Intermediário e Avançado apresentados como estrutura proposta. Preços, quotas e composição permanecem em definição, sem checkout ou alteração das assinaturas atuais."] },
  { id: "desktop-identidade", when: "2026-10-26", title: "LegalOS Desktop: identidade própria e apresentação no produto", items: ["Área de trabalho independente para computador, sem a barra lateral do Func. Busca por nome, CPF ou processo e pastas por cliente com múltiplos casos, trabalho, conversas, documentos, intimações e financeiro, conforme vínculos e permissões.", "Nova logo vetorial LegalOS Desktop em preto e branco, com versões para os temas claro e escuro. A animação de entrada existente foi mantida; a alternativa mais elaborada não será aplicada.", "Desktop destacado na página de produto, com apresentação própria em /produto/desktop e telas de demonstração fictícias. Organização automática, voz e análise conectada a notebooks permanecem como ideias futuras, sem integração anunciada como pronta."] },
  {id:"chat-operacao-7",when:"2026-10-24",title:"Chat: campanhas maiores, situações, ligações e pareamento",migration:"20261224000000_chat_operations",items:["Campanhas com até 10 mil destinatários, busca paginada, seleção de todos os clientes do filtro e relatório paginado. Criação atômica, aprovação humana, opt-out e lotes graduais; envio incerto não é repetido automaticamente.","Seis situações de atendimento, atualização por resposta humana e retorno do cliente e redistribuição após intervalo configurável por número. Status personalizados continuam separados.","Ligações recebidas pelo driver QR viram registros no chat, sem gravação de áudio ou atendimento automático. Registro manual identificado para todos os tipos de conexão; Meta Calling não está integrado.","Novo pareamento preserva conta, conversas, mensagens e vínculos, exige 2FA cadastrado e pausa campanhas para revisão. Não importa sessões ou histórico de outros fornecedores."]},
  {id:"atividades-workflows-catalogo",when:"2026-10-23",title:"Atividades integradas, recorrência e workflows",migration:"20261223000000_activity_operations",items:["Gestão reúne tarefas, compromissos e prazos originais. Agenda tem lista, dia, semana e mês com filtros. Quadros livres continuam disponíveis separadamente.","Checklists, colaboradores e séries de tarefas/compromissos, com limite de 120 ocorrências por dois anos. Edição e cancelamento das próximas preservam concluídas.","Pacotes com datas relativas, dias úteis operacionais, exceções de calendário e dependência da conclusão anterior. Execução atômica, sem duplicação em reenvio.","Catálogo compartilhado RUTE/REST/MCP ampliado a 52 ferramentas: 32 consultas e 20 propostas, sempre com confirmação humana para executar.","Diagnóstico de WhatsApp, tribunais e migração em Integrações. Busca pública Google/Gemini com fontes recuperadas e síntese identificada. Homologação externa continua dependente de acesso real."]},
  { id: "visao-geral-gestao", when: "2026-10-23", title: "Visão geral orientada à gestão do escritório", items: ["Prioridades de prazos, tarefas e intimações; resumo financeiro com baixas e saldos reais; agenda, distribuição de trabalho e carteira de clientes e processos substituem auditoria, plano e indicadores técnicos na página inicial.", "Indicadores respeitam permissões, processos sigilosos e fuso do escritório. Processos no acervo não entram na carteira em gestão. Cadastros do mês incluem importações; volume de tarefas não representa complexidade."] },
  { id: "rute-acoes-na-conversa", when: "2026-10-23", title: "Ações operacionais e confirmação dentro da conversa", items: ["RUTE, MCP e REST compartilham 35 ferramentas: cadastro/atualização de clientes, edição/comentário/situação de tarefas e criação/edição/cancelamento de compromissos por propostas. A pessoa revisa e executa a ação no próprio chat.", "Capacidades disponíveis e consulta de propostas/resultados. Esquemas de propostas publicados a partir da validação do servidor; alterações guardam a versão do registro e recusam aprovação com contexto antigo."] },
  { id: "api-ferramentas-compartilhadas", when: "2026-10-23", title: "REST, RUTE e MCP com catálogo compartilhado", items: ["REST descobre e chama as mesmas ferramentas da RUTE/MCP com escopos tools:read/tools:propose, origem API auditada e propostas sujeitas à decisão humana. Contrato OpenAPI autenticado acompanha o catálogo.", "Novas consultas de detalhe de tarefa, prazo, compromisso e equipe. Inventário técnico documenta as 24 ferramentas, rotas HTTP, serviços internos e lacunas por módulo."] },
  { id: "rute-indicadores", when: "2026-10-23", title: "RUTE consulta os totais do painel", items: ["Ferramenta de indicadores usa as mesmas contagens da visão geral, com permissões por módulo e visibilidade dos processos. A busca de clientes também aceita situação; a assistente é orientada a consultar os totais em vez de contar listas paginadas."] },
  { id: "ajuda-completa-ia-config", when: "2026-10-23", title: "Ajuda ampliada e configuração de IA unificada", items: ["Guias de uso por módulo, configurações, solução de problemas e glossário, com filtros, busca por palavras e leitura em lotes. Atalhos respeitam permissões.", "Configurações → IA centraliza provedor e chave do escritório, também usados pelas ferramentas de IA. O formulário preserva os dados em erro, informa que a chave salva não volta ao campo e permite testar a configuração sem enviar dados do escritório."] },
  { id: "central-ajuda", when: "2026-10-23", title: "Central de ajuda com guias de uso", items: ["Ajuda no menu dos três espaços e no topo, com busca por assunto, filtros por área e 11 guias de primeiros passos e uso. Atalhos respeitam as permissões e os guias explicam as dependências de conexões, certificados e IA."] },
  { id: "workspace-ux-rute", when: "2026-10-23", title: "Navegação organizada e RUTE no canto da tela", items: ["RUTE em botão discreto que abre uma conversa em painel, com histórico pessoal, nova conversa e fechamento por Escape; mantém a página e o rascunho durante a navegação interna. A IA continua dependendo do provedor e das permissões já configurados.", "Menu lateral separa atalhos do dia a dia de Gestão, Ferramentas e Relacionamento; conexões do Box ficam agrupadas. Configurações permanecem no rodapé.", "Configurações com busca e cinco grupos por assunto. Dados do escritório, plano/cobrança e segurança agora têm páginas próprias, sem a antiga faixa de abas."] },
  { id: "datajud-diagnostico", when: "2026-10-23", title: "DataJud: falhas identificadas e último teste visível", items: ["Testes e consultas distinguem tempo esgotado, rede, acesso recusado, limite de consultas e respostas inválidas/incompletas. A tela mostra o último teste e diferencia habilitação de disponibilidade. Falhas não registram sincronização concluída nem importam respostas parciais. Consultas MNI usam os namespaces dos parâmetros declarados no contrato público do TJPR; acesso real continua sujeito às permissões do tribunal."] },
  {
    id: "autos-fila-box-fluxo", when: "2026-10-23", title: "Autos em fila e validação do ciclo da BOX", migration: "20261222000000_autos_queue",
    items: [
      "Download de autos em lotes automáticos, persistido no banco: progresso, retomada após interrupções, três tentativas por falha e reenvio manual. Arquivos já recebidos são preservados; arquivos ignorados não bloqueiam os próximos lotes.",
      "Notificações de conclusão/falha e autorização conferida a cada execução. A página de autos permite acompanhar a fila ao retornar.",
      "Fluxo da BOX verificado com dados de teste: recebimento, distribuição, tarefa, prazo com validação humana, documentos, conclusão, histórico e notificações. Testes não equivalem a homologação de tribunal real.",
    ],
  },
  {
    id: "tribunais-mni-condicional", when: "2026-10-23", title: "Conexões por sistema e contrato MNI 2.2.2", migration: "20261221000000_court_connectors",
    items: ["Sistema por processo, ambiente e inspeção do WSDL limitam as operações ao contrato cadastrado. eproc, e-SAJ e PROJUDI são condicionados à disponibilidade de MNI 2.2.2; MNI 3.0 e interfaces proprietárias não estão implementados. Perfil SCMPP/TJPR atende apenas movimentações públicas. Nenhum novo tribunal foi homologado nesta entrega."],
  },
  {
    id: "datajud-chave-escritorio", when: "2026-10-23", title: "DataJud: chave e teste de conexão em Integrações", migration: "20261220000000_datajud_org",
    items: ["Guarde a chave pública do CNJ com cifra por escritório, teste a autenticação e ligue a consulta sem precisar editar o servidor. A chave não volta ao navegador nem à auditoria. Configuração do servidor continua disponível como alternativa."],
  },
  {
    id: "box-operacao", when: "2026-10-23", title: "BOX: leitura integrada, autos, automações e etapas", migration: "20261219000000_box_operation",
    items: [
      "Leitor integrado preserva filtros e página; teor, notas, providências e contexto do processo juntos.",
      "Autos digitais com índice paginado, busca, favoritos pessoais, prévia autenticada e estado da sincronização MNI.",
      "Automações com condições E/OU e distribuição/etiquetas de intimações na mesma transação da tarefa.",
      "Etapas personalizáveis de tarefas, incluindo Aguardando protocolo, mantendo status-base e métricas consistentes.",
      "Painel de operação e auditoria do histórico importado. Captura/protocolo reais aguardam acesso de homologação; conectores ausentes permanecem identificados.",
    ],
  },
  {
    id: "box-filtros-lotes", when: "2026-10-22", title: "Box: paginação, filtros e ações em lote",
    items: [
      "Caixa com páginas de 25, 50 ou 100 itens, ordem crescente/decrescente e filtros por tipo, origem, órgão, recebimento e publicação. Filtros são preservados ao mudar de página ou caixa.",
      "Selecionar até 100 intimações da página, revisar e confirmar distribuição para pessoa/equipe, adição de etiquetas, adormecimento ou tratamento. O lote é atômico e auditado: alterações concorrentes ou falta de acesso recusam tudo. Distribuição respeita o sigilo também para os destinatários.",
      "A lista de etiquetas passa a respeitar o sigilo dos processos; a tabela mostra a origem de cada intimação.",
    ],
  },
  {
    id: "box-leitura-origem", when: "2026-10-22", title: "Box: leitura das publicações e indicadores de origem",
    items: [
      "Publicações com HTML são apresentadas como texto legível, preservando o original. Box e Monitoramento separam capturas DJEN/PJe de outras importações e usam o mesmo período no fuso do escritório.",
      "Diagnóstico de tarefas migradas do Astrea sinaliza comentários de conclusão com tarefa ainda aberta, sem alterar dados. Conferir CSV de origem e reaberturas antes de corrigir.",
    ],
  },
  {
    id: "6.0.0", when: "2026-10-22", title: "Versão 6.0.0: RUTE, a IA do LegalOS (conecte Claude, ChatGPT e Gemini; assistente embutido; propostas com confirmação)", migration: "20261218000000_rute_6_0",
    items: [
      "Nova aba RUTE no menu. Tudo nasce desligado; quem administra as integrações liga cada recurso (conexão de IAs externas, propostas, assistente) e tem uma parada de emergência que corta tudo na hora.",
      "Servidor MCP (/api/mcp): Claude, ChatGPT, Gemini e outros consultam processos, clientes, andamentos, prazos, tarefas, intimações, agenda e a biblioteca do escritório, sempre como a pessoa que conectou (mesmas permissões e mesmo sigilo). CPF, CNPJ e e-mails saem ocultados. Conecta por login com consentimento (OAuth, exige verificação em duas etapas) ou por chave de API; há passo a passo, botão de testar conexão e lista de conexões com revogar.",
      "Propostas da IA com confirmação humana: tarefa, prazo em rascunho, anotação, minuta, andamento, petição em rascunho e envio de petição para revisão. Nada é criado até uma pessoa revisar, editar e aprovar; ações de maior risco pedem confirmação reforçada. Nunca protocola e nada fala com cliente.",
      "Assistente embutido (Claude, Gemini ou OpenAI, com a chave do escritório ou do sistema): conversa privada de cada pessoa, com referências do que consultou. Botão RUTE nas telas de processo e de cliente abre a conversa já com o contexto, sem enviar nada sozinho.",
      "Biblioteca do escritório (instruções e modelos por área) lida pela IA, e pacote .zip de skill para enviar ao Claude.",
      "Governança: limite mensal do escritório e por pessoa conforme o perfil, relatório de uso em tokens, histórico do que a IA fez, retenção configurável das conversas e relatório de LGPD (o que saiu para IAs, por cliente e processo) com CSV. O texto das perguntas nunca é guardado no histórico.",
    ],
  },
  {
    id: "5.0.0", when: "2026-10-22", title: "Versão 5.0.0: calculadoras, portal em linguagem simples, cobrança Pix/boleto, triagem com minuta, copiloto e metas", migration: "20261217000000_calc_5_0",
    items: [
      "Cálculos (menu Cálculos): atrasados da Justiça Federal (INPC e SELIC), débito do TJSP (tabela, SELIC ou híbrido), atualização trabalhista (ADC 58), verbas rescisórias e prazos. Salvo no processo, com planilha Excel/CSV e memorial. Índices do Banco Central sincronizados; tabela do TJSP e reajuste do INSS carregáveis; o que faltar o escritório lança e o sistema nunca inventa índice. É ferramenta de apoio: confira com a decisão e o cálculo oficial.",
      "Portal do cliente: andamento em linguagem simples (rascunho → revisão humana → só então o cliente vê), pendências do cliente (ele marca como feita, a equipe confirma) e mensagens para a equipe, com aviso ao responsável.",
      "Cobrança de honorários por Pix e boleto pelo Asaas do escritório, com baixa automática pelo aviso do Asaas (token próprio, idempotente). Contratos de êxito: valor esperado e geração do honorário quando o êxito ocorre. Nasce desligada; teste primeiro no sandbox.",
      "Triagem de publicações com minuta: o que exige, ato e prazo calculado (ciência presumida pelo DJe) e minuta em rascunho, por regras ou com IA (chave real, IA ligada). Validar é humano; o prazo criado nasce como rascunho.",
      "Copiloto de atendimento: cole a transcrição (ou envie o áudio para o Gemini) e receba resumo, ações que podem caber, tarefas e documentos. Só vira tarefa o que uma pessoa marcar e revisar. Nada é enviado ao cliente.",
      "Metas mensais por pessoa e da equipe (tarefas, pontos, prazos, horas) e carga de trabalho por peso (pontos do tipo de tarefa), com sugestão de distribuição das tarefas sem responsável que uma pessoa confirma.",
    ],
  },
  {
    id: "4.0.0", when: "2026-10-21", title: "Versão 4.0.0: Chat no nível do ChatGuru — robô 2.0, campanhas, transcrição, relatórios e segurança", migration: "20261216000000_chat_4_0",
    items: [
      "Etiquetas prontas (por área, origem e responsável), menção a colega nas notas, encaminhar mensagem a até 10 chats, biblioteca de arquivos, checklists enviáveis e status de chat.",
      "Encerramento automático de conversas paradas (só encerra, não escreve ao cliente) e pesquisa de satisfação opcional ao encerrar.",
      "Robô 2.0: diálogos (reenvio por tempo sem resposta, parabéns, aviso de audiência/perícia, resposta sobre horário) e entrega da conversa ao advogado responsável; intenções por pontuação de palavras (sem IA). Tudo nasce desligado e respeita quem pediu para parar.",
      "Campanhas em massa controladas: rascunho, aprovação humana, envio gradual, no máximo 500 clientes, modelo obrigatório na API oficial, relatório por destinatário. Desligadas por padrão.",
      "Transcrição de áudio pelo Gemini (2 créditos por áudio; precisa de GEMINI_API_KEY, da chave do Chat e da IA ligada).",
      "Relatórios novos (por status, chats adicionados, tempo por usuário, acessos) e resumo agendado por e-mail com números do período.",
      "Segurança da conta: IP permitido (com trava anti-bloqueio), saída por inatividade, sessões da equipe; módulos por plano (campanhas, IA, cofre).",
    ],
  },
  {
    id: "2.0.0", when: "2026-10-21", title: "Versão 2.0.0: Kanban, financeiro, processo, Astrea, Chat completo, IA e cofre de clientes", migration: "20261208000000_f3_kanban … 20261215000000_f11_cofre",
    items: [
      "Kanban de gestão e pacotes de tarefas; financeiro com fluxo anual, faturas e boleto; processo com honorário, apensos, recursos, provisão e correção por índices oficiais.",
      "Documentos do Astrea importados como link; importação de andamentos.",
      "Chat: até 5 números por escritório, retornos combinados, mensagens agendadas e NPS (desligados por padrão), formulários, relatórios e exportação em CSV com auditoria.",
      "IA (precisa da chave do provedor): resumo de conversa, mapa de pesquisa de jurisprudência (nunca inventa precedente) e minuta de peça para revisão.",
      "Cofre de senhas de clientes (só Proprietário/Administrador; senha só abre com o código do 2FA e fica registrada), modelos de perfil com o mínimo de acesso e revisão de acessos sensíveis.",
      "Troca de chaves (rotate-keys) agora também protege credenciais de tribunais e o cofre de clientes.",
    ],
  },
  {
    id: "3.0-F6", when: "2026-10-21", title: "LegalMail: sistema por tribunal e registro de conectores", migration: "20261207000000_legalmail_f6",
    items: [
      "Configurações → Sistemas dos tribunais: o escritório diz qual sistema atende cada tribunal (PJe, eproc, e-SAJ, PROJUDI). Nada é presumido.",
      "Relatório de prontidão: só o PJe/MNI tem conector, e ainda sem validação em tribunal real. eproc, e-SAJ e PROJUDI estão marcados como sem conector.",
      "Tribunal definido em sistema sem conector recusa consulta e protocolo automáticos, com aviso claro (nada é simulado).",
    ],
  },
  {
    id: "3.0-F7", when: "2026-10-21", title: "LegalMail: painel de saúde do monitoramento", migration: "(sem migração)",
    items: [
      "Página Monitoramento: cada fonte (DJEN e PJe/MNI) com última execução, erro e situação (em dia, com erro, parada, nunca rodou, desligada), e as intimações importadas nos últimos 7 dias.",
      "Nova rotina agendada a cada 30 minutos avisa quem administra integrações quando uma fonte falha ou fica mais de 36 horas parada (sem repetir o mesmo aviso). Exige reinstalar o agendador (install-cron.sh).",
    ],
  },
  {
    id: "3.0-F8", when: "2026-10-21", title: "LegalMail: classificação de documentos por IA", migration: "20261206000000_legalmail_f8",
    items: [
      "Sugestão de categoria do documento pela IA (só com a chave do escritório e a IA ligada), com trecho mascarado e exemplos das decisões anteriores do próprio escritório.",
      "Fila Documentos → Classificar com IA: uma pessoa aceita, corrige ou descarta; nada muda sozinho. Processos sigilosos respeitados.",
    ],
  },
  {
    id: "3.0-F3b", when: "2026-10-21", title: "LegalMail: Google Drive/Docs opcional", migration: "20261205000000_legalmail_f3b",
    items: [
      "Cada escritório cadastra as próprias credenciais do Google (Configurações → Integrações); cifradas, com liga/desliga e escopo restrito (drive.file). Sem chave global.",
      "Envio do documento ao Drive, edição no Google Docs e retorno como nova versão. Processos sigilosos nunca são enviados.",
    ],
  },
  {
    id: "3.0-notas", when: "2026-10-21", title: "LegalMail: notas com anexos e histórico", migration: "20261204000000_legalmail_notes",
    items: [
      "Notas de processo podem ser editadas (o texto anterior fica no histórico), receber até 10 anexos e têm histórico de criação, fixação e exclusão.",
    ],
  },
  {
    id: "3.0-F6b", when: "2026-10-21", title: "LegalMail: credenciais por tribunal e usuário", migration: "20261203000000_legalmail_f6b",
    items: [
      "Cada pessoa guarda a própria credencial de acesso ao tribunal (cifrada, nunca volta para a tela). Administradores veem quem tem credencial e podem remover, sem ler o segredo.",
      "Conferência de requisitos do sistema (senha, certificado do cofre) sem acessar o tribunal.",
    ],
  },
  {
    id: "3.0-F10", when: "2026-10-21", title: "LegalMail: créditos e custos", migration: "20261202000000_legalmail_f10",
    items: [
      "Cobrança por créditos opcional por escritório (liga o administrador do sistema). Protocolo real consome 5 créditos, do lote que vence primeiro; sem saldo, não protocola. Aviso de saldo baixo e de lotes a vencer.",
    ],
  },
  {
    id: "3.0-F9", when: "2026-10-21", title: "LegalMail: certificado com usuários autorizados e webhooks de protocolo", migration: "20261201000000_legalmail_f9",
    items: [
      "Certificado pode ser autorizado a usuários específicos. Novos webhooks: petição enviada e petição com falha (sem expor mensagem técnica).",
    ],
  },
  {
    id: "3.0-F5", when: "2026-10-21", title: "LegalMail: fila de protocolos, recibo e agendamento", migration: "20261130000000_legalmail_f5",
    items: [
      "Fila de protocolos com acompanhamento, recibo, agendamento e cancelamento com cópia em rascunho. Aguarda validação em tribunal real.",
    ],
  },
  {
    id: "3.0-F2", when: "2026-10-21", title: "LegalMail: Tarefas 2.0", migration: "20261129000000_legalmail_f2",
    items: [
      "Tipos de tarefa com pontuação (Configurações → Tarefas): cada tipo vale N pontos. Na lista de Tarefas, o cartão \"Pontuação do mês\" soma os pontos das tarefas concluídas, por responsável.",
      "Etiquetas coloridas por escritório, no cadastro e como filtro na lista; a tarefa ganha o cartão \"Tipo e etiquetas\".",
      "Menções nos comentários: escolha \"@ Mencionar\" e a pessoa recebe um aviso. Só membros do escritório, pelo nome completo.",
      "Anexos na tarefa (PDF, imagens, Office, texto; até 8 MB), baixados só por quem pode ver a tarefa; tarefas de processo sigiloso não vazam anexos.",
      "Histórico da tarefa: quem criou, mudou prazo, responsável, prioridade, situação, tipo, etiquetas e anexos, e quando.",
      "Ficou para depois: anexos e histórico das notas de processo (a F1 só tinha as notas).",
    ],
  },
  {
    id: "3.0-F4", when: "2026-10-21", title: "LegalMail: importação de processos em lote", migration: "20261128000000_legalmail_f4",
    items: [
      "Processos → Importar por número: cole até 200 números CNJ (um por linha ou separados por vírgula) e o sistema cadastra todos de uma vez, ligando ao cliente que você escolher.",
      "Cada número é tratado sozinho: inválidos (tamanho ou dígito verificador), repetidos na lista e os que já existem ficam anotados, sem derrubar o resto. Reimportar o mesmo número não duplica.",
      "Opcional: buscar os andamentos públicos no DataJud (só se estiver ligado e com chave) e baixar os autos pelo MNI/PJe (só para tribunais com conexão ativa). Roda em passos curtos, com andamento na tela; se você fechar a página, o botão Continuar retoma de onde parou.",
      "Resultado por número, com o motivo de cada falha, e histórico das importações anteriores. Processos sigilosos nunca são consultados em serviços externos.",
    ],
  },
  {
    id: "3.0-F3", when: "2026-10-21", title: "LegalMail: timbrados, novas variáveis e prévia em PDF", migration: "20261127000000_legalmail_f3",
    items: [
      "Documentos → Modelos → Timbrados: cabeçalho, rodapé e logo (PNG/JPEG até 300 KB) do escritório, com numeração de páginas opcional e um timbrado padrão. O .docx gerado de um modelo já sai com o timbrado escolhido (ou o padrão, ou sem timbrado).",
      "Pré-visualizar em PDF na tela de gerar documento: mostra como o texto vai ficar, com o timbrado, sem gravar nada. É uma prévia do texto; o arquivo oficial continua sendo o .docx editável.",
      "Novas variáveis nos modelos: polo ativo e polo passivo, advogado(a) responsável, data de distribuição, número antigo e CNPJ do escritório. O que faltar continua aparecendo como [PREENCHER].",
      "Autotextos e modelos já existiam; esta fase fechou o que faltava deles em relação ao LegalMail. A prévia em PDF de um .docx já anexado a uma petição não é possível sem um conversor no servidor e ficou fora.",
    ],
  },
  {
    id: "3.0-F1", when: "2026-10-21", title: "LegalMail: partes únicas, campos personalizados, acervo e notas fixas", migration: "20261126000000_legalmail_f1",
    items: [
      "Cadastro único de partes (menu Processos → Cadastro de partes): adversários, advogados e órgãos cadastrados uma vez e reaproveitados em qualquer processo, com busca por nome, documento ou profissão. Editar o nome atualiza os processos ligados; excluir não apaga os dados já gravados nos processos.",
      "Campos personalizados de processo (Configurações → Campos personalizados): texto, número, data e lista de opções, criados por quem administra e preenchidos na página do processo. Desativar esconde o campo e guarda os valores.",
      "Acervo: botão para mover o processo para o acervo (sem excluir) e devolver à carteira. A lista de processos mostra a carteira ativa e, separado, o acervo.",
      "Notas do processo numa aba própria, com fixar no topo, e Nota em lote: a mesma nota aplicada a até 50 processos de uma vez (tudo ou nada; respeita sigilo e escritório).",
      "Anexos nas notas e histórico de alterações da nota ficam para a fase de Tarefas 2.0.",
    ],
  },
  {
    id: "2.0-F6", when: "2026-10-21", title: "Pequenos itens: aniversariantes, 2FA obrigatório, Excel e WhatsApp", migration: "20261125000000_pequenos_itens",
    items: [
      "Central de alertas ganhou a aba Aniversariantes (clientes pessoa física ativos, hoje e próximos 7 dias), com botão para enviar parabéns pelo WhatsApp depois de você revisar o texto.",
      "Em Configurações, o dono pode exigir 2FA de todo o escritório. Quem ainda não ativou fica numa tela de ativação até ativar; o dono precisa ter o próprio 2FA antes, e ninguém desliga o 2FA enquanto o escritório exigir.",
      "Exportação para Excel (.xlsx) e CSV de clientes, processos, tarefas, lançamentos e relatórios, respeitando permissões e processos confidenciais.",
      "Botão Enviar por WhatsApp no processo e no cliente, com texto sugerido editável. Nada sai sem você clicar; fora da janela de 24 h da Meta o sistema recusa e explica.",
    ],
  },
  {
    id: "2.0-F15", when: "2026-10-22", title: "Comunicados do developer", migration: "20261124000000_comunicados",
    items: [
      "Nova aba Comunicados no painel do developer: escrever novidade, manutenção ou alerta e enviar no sino do sistema e/ou no celular, para todos os escritórios, um escritório ou uma pessoa (pelo e-mail).",
      "Antes de enviar, o painel mostra quantas pessoas e quantos aparelhos vão receber, e o envio só vale se você confirmar esse número.",
      "Cada pessoa recebe uma vez. Quem desligou \"comunicados\" nas preferências do celular não recebe push (o sino continua). Escritórios suspensos e usuários desativados ficam de fora.",
      "Limite de 5 comunicados por hora e bloqueio de repetição do mesmo título para o mesmo público em 10 minutos. O texto não vai para a auditoria; só quem enviou, público e contagens.",
      "Histórico dos enviados com contagem de pessoas, avisos no sistema e no celular. Agendamento ficou para uma próxima versão.",
    ],
  },
  {
    id: "2.0-F14", when: "2026-10-21", title: "Avisos no celular (push) de prazos e tarefas a vencer", migration: "20261123000000_push",
    items: [
      "Cada pessoa ativa o aviso no próprio aparelho (Minha conta → Avisos no celular) e escolhe a antecedência (0 a 3 dias) e se quer prazos, tarefas ou os dois. Android pelo Chrome; iPhone só com o app instalado na tela inicial (iOS 16.4+).",
      "Botão \"Enviar notificação de teste\" que manda um aviso só para os aparelhos de quem clicou.",
      "Texto sempre genérico (quantidade de prazos e tarefas): nunca nome de cliente nem número de processo. Só envia entre 7h e 20h; cada item é avisado uma vez por etapa.",
      "Interruptor geral por escritório (nasce desligado, só administrador liga, fica na auditoria). Sem as chaves VAPID no servidor, o recurso fica travado e a tela avisa a TI.",
      "Nova rotina push-due a cada 15 minutos (painel developer, com \"Rodar agora\"). Passo a passo em docs/push.md.",
    ],
  },
  {
    id: "2.0-F2", when: "2026-10-21", title: "Indicadores e central de alertas",
    items: [
      "Página Indicadores: atrasados por tipo (tarefas, prazos, publicações, honorários e contas vencidos com saldo), movimentação dos processos em 7/30/60/90 dias, evolução da carteira (12 meses), processos ativos por cliente e os seus números pessoais.",
      "Central de alertas com abas (publicações, andamentos, processos parados, tarefas, prazos, agenda, financeiro e integrações), contadores e link direto para agir em cada item.",
      "Tudo calculado na hora com dados reais, respeitando a permissão de cada perfil e os processos confidenciais. Sem tabela nova.",
    ],
  },
  {
    id: "chat-sla-triagem", when: "2026-10-21", title: "Chat: SLA de resposta e triagem por área", migration: "20261122000000_chat_sla",
    items: [
      "SLA de resposta: se o cliente escreveu e ninguém respondeu em 15 min (padrão, a qualquer hora), o responsável recebe aviso no sistema e por e-mail. Nasce desligado; não escreve ao cliente.",
      "Quando uma pessoa responde, o alerta some sozinho; um alerta por mensagem do cliente; conversas com mais de 24 h sem resposta não geram alerta.",
      "Modelo de triagem por área (previdenciário, trabalhista, cível): regras de palavras-chave que mandam a conversa para a fila e/ou o atendente da área. Criadas desligadas; \"Outros\" cai na fila padrão.",
      "Nova rotina chat-sla a cada 5 minutos (aparece na saúde do painel developer, com \"Rodar agora\").",
      "Documento docs/migracao-n8n-chatguru.md: o que o fluxo do n8n faz hoje e onde cada parte vive no LegalOS.",
    ],
  },
  {
    id: "site-produto", when: "2026-10-21", title: "Site público do produto (/produto)",
    items: [
      "Cinco páginas públicas: Início, Recursos, Segurança, Sobre e Contato, com topo escuro e resto claro.",
      "Telas reais do sistema com dados de demonstração fictícios (nenhum cliente real).",
      "Só fatos verificados: sem depoimentos, clientes, preços ou concorrentes inventados.",
      "Botão \"Falar com a gente\" usa PUBLIC_CONTACT_WHATSAPP e PUBLIC_CONTACT_EMAIL; sem eles, leva ao login.",
    ],
  },
  {
    id: "2.0-F13", when: "2026-10-21", title: "Painel do developer", migration: "20261121000000_painel_developer",
    items: [
      "Nova área só para o dono da plataforma (com 2FA): /admin/developer.",
      "Saúde e rotinas: situação das 6 rotinas do agendador, histórico, e botão \"Rodar agora\" para webhooks, e-mail, DJEN e MNI.",
      "API, chaves e webhooks: contagens, webhooks instáveis, entregas e e-mails com falha com \"Reenviar\".",
      "Auditoria e erros: erros inesperados agrupados (mensagem mascarada), acessos negados e ações do administrador.",
      "Integrações e interruptores: testes de banco, arquivos, SMTP, Asaas, DataJud e DJEN; parada de emergência por escritório (só desliga).",
      "Aba Novidades e andamento (esta página).",
    ],
  },
  {
    id: "2.0-F1", when: "2026-10-20", title: "Tratamento de publicações", migration: "20261120000000_publicacoes_destinatario",
    items: [
      "Contadores do dia na Caixa de entrada (não tratadas, tratadas e descartadas hoje).",
      "Aviso quando um nome monitorado falhou, nunca foi verificado ou está parado há mais de 36 h.",
      "Cada monitoramento do DJEN pode enviar as publicações novas direto a um membro ou a uma equipe.",
      "\"Sugerir providência com IA\": só sugere, mascara CPF/CNPJ e exige IA ligada e chave real; nada é criado sem a pessoa conferir.",
    ],
  },
  {
    id: "chat-ux", when: "2026-10-20", title: "Novo visual do LegalOS Chat",
    items: [
      "Atendimento em tela cheia com 3 colunas, fundo de conversa, avatares e seletor de emojis.",
      "Painel lateral com atribuição, vínculos (processo, tarefa, agenda, CRM, documentos) e filtros recolhíveis.",
    ],
  },
  {
    id: "chat-switches", when: "2026-10", title: "LegalOS Chat: automações, robô, cobrança e interruptores", migration: "20261114 a 20261117",
    items: [
      "Automações, robô de atendimento e mensagem de ausência, cada um com botão ligar/desligar.",
      "Cobrança por WhatsApp (nasce DESLIGADA; só liga por decisão explícita e auditada).",
      "Central de interruptores do Chat.",
    ],
  },
  {
    id: "1.x", when: "2026-10", title: "Núcleo do sistema (1.x)",
    items: ["Clientes, processos, tarefas, prazos, agenda, financeiro com Asaas, CRM, documentos e petições, DataJud/MNI/DJEN, OCR, relatórios, portal do cliente, API e webhooks, 2FA, PWA, backups e painel da plataforma."],
  },
];

export type Phase = { id: string; title: string; status: PhaseStatus };

export const PHASES_2: Phase[] = [
  { id: "2.0-F1", title: "Tratamento de publicações", status: "feita" },
  { id: "2.0-F13", title: "Painel do developer", status: "feita" },
  { id: "2.0-F2", title: "Indicadores e central de alertas", status: "feita" },
  { id: "2.0-F3", title: "Kanban de gestão e workflows do escritório", status: "feita" },
  { id: "2.0-F4", title: "Financeiro: fluxo de caixa, contas, faturas", status: "feita" },
  { id: "2.0-F5", title: "Processo mais rico (honorário, apensos, recursos, provisão)", status: "feita" },
  { id: "2.0-F6", title: "Pequenos itens (aniversariantes, 2FA obrigatório, exportar Excel, enviar por WhatsApp)", status: "feita" },
  { id: "2.0-F7", title: "Migração Astrea (modelos, certificado, andamentos)", status: "feita" },
  { id: "2.0-F8", title: "Chat: vários números e relatórios", status: "feita" },
  { id: "2.0-F9", title: "Chat: follow-ups, agendadas, NPS, exportação, formulários", status: "feita" },
  { id: "2.0-F10", title: "IA com chave real (resumo, jurisprudência, peças)", status: "feita" },
  { id: "2.0-F11", title: "Cofre de credenciais de clientes e perfis mínimos", status: "feita" },
  { id: "2.0-F14", title: "Avisos no celular (push) de tarefas e prazos a vencer", status: "feita" },
  { id: "2.0-F15", title: "Comunicados do developer: enviar aviso no celular e no sistema para todos os escritórios, um escritório ou uma pessoa", status: "feita" },
  { id: "2.0-F12", title: "Fechamento: revisão geral e versão 2.0.0", status: "feita" },
];

export const PHASES_3: Phase[] = [
  { id: "3.0-F1", title: "Cadastro único de partes, campos personalizados, arquivar, notas fixas e em lote", status: "feita" },
  { id: "3.0-F2", title: "Tarefas 2.0 (tipos com pontuação, etiquetas, menções, anexos, histórico)", status: "feita" },
  { id: "3.0-F3", title: "Autotextos com variáveis, timbrados e prévia em PDF", status: "feita" },
  { id: "3.0-F3b", title: "Google Drive/Docs opcional, com credenciais de cada escritório (Configurações → Integrações)", status: "feita" },
  { id: "3.0-F4", title: "Importação de processos em lote e download de autos", status: "feita" },
  { id: "3.0-F5", title: "Fila de protocolos, recibo, agendamento e cancelamento", status: "feita" },
  { id: "3.0-F6", title: "Conectores de peticionamento além do MNI", status: "feita" },
  { id: "3.0-F7", title: "Monitoramento de intimações nos sistemas dos tribunais", status: "feita" },
  { id: "3.0-F8", title: "Classificação de documentos por IA", status: "feita" },
  { id: "3.0-F9", title: "Certificado com usuários autorizados e webhooks de protocolo", status: "feita" },
  { id: "3.0-F10", title: "Créditos e custos", status: "feita" },
  { id: "3.0-F6b", title: "Credenciais por tribunal e usuário no cofre", status: "feita" },
  { id: "3.0-F11", title: "Completar com o que aparecer nas telas do LegalMail", status: "em andamento" },
];

export const PHASES_4: Phase[] = [
  { id: "4.0-F1", title: "Etiquetas pré-definidas, menção a colega e encaminhar a vários chats", status: "feita" },
  { id: "4.0-F2", title: "Biblioteca de arquivos e checklists enviáveis no chat", status: "feita" },
  { id: "4.0-F3", title: "Vários números de WhatsApp com status e reconexão", status: "feita" },
  { id: "4.0-F4", title: "Status de chat e arquivamento automático", status: "feita" },
  { id: "4.0-F5", title: "Bot 2.0: horário, audiência/perícia, aniversário, timer e delegador", status: "feita" },
  { id: "4.0-F6", title: "Relatórios de atendimento e exportação agendada", status: "feita" },
  { id: "4.0-F7", title: "Campanhas em massa controladas", status: "feita" },
  { id: "4.0-F8", title: "NPS pós-atendimento", status: "feita" },
  { id: "4.0-F9", title: "Intenções, transcrição e resumo por IA", status: "feita" },
  { id: "4.0-F10", title: "Módulos por plano e segurança da conta", status: "feita" },
  { id: "4.0-F11", title: "Completar com o que aparecer nas telas ainda não vistas do ChatGuru", status: "a fazer" },
];

export const PHASES_5: Phase[] = [
  { id: "5.0-F1", title: "Calculadoras no sistema (atrasados JF, débitos TJSP, trabalhista e prazos)", status: "feita" },
  { id: "5.0-F2", title: "Portal do cliente com andamento em linguagem simples", status: "feita" },
  { id: "5.0-F3", title: "Cobrança de honorários por Pix e boleto com baixa automática", status: "feita" },
  { id: "5.0-F4", title: "Triagem de publicações com minuta (IA, com validação humana)", status: "feita" },
  { id: "5.0-F5", title: "Copiloto de atendimento (transcrição, resumo e ações)", status: "feita" },
  { id: "5.0-F6", title: "Metas e carga de trabalho por pessoa", status: "feita" },
];

/** Ações que dependem da equipe (sem código). Tire da lista quando forem feitas. */
export const PHASES_6: Phase[] = [
  { id: "6.0-F1", title: "Servidor MCP somente leitura (Claude, ChatGPT, Gemini consultam o LegalOS)", status: "feita" },
  { id: "6.0-F2", title: "Conectar as IAs: consentimento, passo a passo e conexões ativas", status: "feita" },
  { id: "6.0-F3", title: "Propostas da IA com confirmação humana", status: "feita" },
  { id: "6.0-F4", title: "Aba própria da RUTE no menu", status: "feita" },
  { id: "6.0-F5", title: "Assistente embutido com vários provedores", status: "feita" },
  { id: "6.0-F6", title: "IA nas telas de processo e cliente", status: "feita" },
  { id: "6.0-F7", title: "Biblioteca do escritório (instruções e modelos por área)", status: "feita" },
  { id: "6.0-F8", title: "Governança: limites, uso, retenção e LGPD", status: "feita" },
  { id: "6.0-F9", title: "Ações de maior risco, sempre com confirmação", status: "feita" },
];

/** Fila da 7.0 (só ideias aprovadas para a fila; nada construído). Detalhes em docs/roadmap-7.0.0.md. */
export const PHASES_7: Phase[] = [
  { id: "7.0-F1", title: "RUTE por voz: ditado e leitura entregues; conversa contínua em evolução", status: "em andamento" },
  { id: "7.0-F2", title: "Resumo da manhã de cada pessoa", status: "a fazer" },
  { id: "7.0-F3", title: "Preparar audiência (roteiro em rascunho)", status: "a fazer" },
  { id: "7.0-F4", title: "Conferir peça antes de protocolar", status: "a fazer" },
  { id: "7.0-F5", title: "Notícia ao cliente em linguagem simples, também por WhatsApp (com aprovação)", status: "a fazer" },
  { id: "7.0-F6", title: "Assinatura de contrato e procuração no sistema", status: "a fazer" },
  { id: "7.0-F7", title: "Pedido de documentos por link ao cliente", status: "a fazer" },
  { id: "7.0-F8", title: "Pesquisa de satisfação no fim do processo", status: "a fazer" },
  { id: "7.0-F9", title: "Painel de sobrecarga e rodízio de férias", status: "a fazer" },
  { id: "7.0-F10", title: "Placar do mês (opcional)", status: "a fazer" },
  { id: "7.0-F11", title: "Previsão de caixa", status: "a fazer" },
  { id: "7.0-F12", title: "Repasse de valores ao cliente", status: "a fazer" },
  { id: "7.0-F13", title: "Cobrança escalonada (desligada até autorização)", status: "a fazer" },
  { id: "7.0-F14", title: "Linha do tempo do cliente", status: "a fazer" },
  { id: "7.0-F15", title: "Alerta de prazo parecido e conflito de audiência", status: "a fazer" },
  { id: "7.0-F16", title: "Modo audiência no celular", status: "a fazer" },
  { id: "7.0-F17", title: "Busca única", status: "a fazer" },
  { id: "7.0-F18", title: "Relatório mensal automático para a sócia", status: "a fazer" },
  { id: "7.0-F20", title: "Mesa da RUTE: tela cheia onde você diz \"traga tudo do cliente X\" e ela organiza processos, prazos e documentos para você mexer", status: "a fazer" },
  { id: "7.0-F19", title: "RUTE faz tarefas pequenas sozinha (criar tarefa para si, marcar como feita, anotar, abrir telas), com interruptor por ação e histórico", status: "a fazer" },
];

/** Ações que dependem da equipe (sem código). Tire da lista quando forem feitas. */
export const TEAM_TODO: string[] = [
  "Box: executar audit:astrea-tasks no escritório migrado e conferir os candidatos com o CSV do Astrea e o histórico de reaberturas antes de corrigir qualquer status.",
  "6.0: validar com contas reais o que só foi testado contra simuladores e documentação: conexão do Claude, do ChatGPT e do Gemini ao /api/mcp (cada um tem regras de plano e de administrador próprias) e as chamadas do assistente embutido aos provedores.",
  "6.0: em RUTE → Situação, ligar a conexão de IAs com o consentimento, informar a chave do provedor do assistente (ou definir ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY no servidor) e cadastrar a biblioteca do escritório antes de liberar para a equipe.",
  "4.0: fornecer a chave do Gemini (GEMINI_API_KEY, opcional GEMINI_MODEL) para a transcrição de áudio e conferir o modelo na conta Google; só foi testada contra simulador.",
  "4.0: rodar install-cron.sh de novo não é necessário (tudo roda dentro da rotina chat-extras), mas conferir em Developer → Rotinas que ela está rodando a cada minuto.",
  "4.0: antes de ligar campanhas, diálogos ou intenções, revisar os textos e começar com poucos clientes; mensagem em massa pode gerar bloqueio no WhatsApp.",
  "4.0: o resumo por e-mail só sai com o envio de e-mail (SMTP) configurado; sem ele nada é enfileirado.",
  "Manter a cobrança pelo WhatsApp DESLIGADA até a Dra. Talita autorizar.",
  "Trocar a chave de API do ChatGuru (ela apareceu no chat) e, depois, reinstalar o agendador no servidor (install-cron.sh) para ativar a rotina chat-sla.",
  "Configurar fila e atendente de cada área em Configurações do Chat → Triagem por área; depois ligar SLA e regras.",
  "Religar o 2FA da conta lforbiano e guardar os códigos de recuperação.",
  "Trocar os segredos que apareceram no chat (rotate-secrets.sh).",
  "Configurar a cópia do backup fora do servidor (BACKUP_OFFSITE).",
  "Configurar o SMTP e rodar o mail-test.",
  "Ciclo completo no Asaas sandbox.",
  "Importar andamentos do Astrea (--only andamentos --dry-run, conferir, depois --yes).",
  "3.0: validar em ambiente real o que só foi testado com simuladores: protocolo MNI (homologação do tribunal), Google Drive (credenciais próprias do escritório), classificação por IA (chave do provedor) e o painel de monitoramento; reinstalar o agendador (install-cron.sh) para a rotina monitoring.",
  "Fornecer a chave do provedor de IA (ANTHROPIC_API_KEY) e ligar a IA em Integrações; depois ligar o resumo de conversa em Configurações do Chat.",
  "Rodar install-cron.sh de novo (nova rotina chat-extras, a cada minuto) para mensagens agendadas e lembretes de retorno.",
  "Conferir no servidor a sincronização dos índices do Banco Central (correção monetária) e importar documentos do Astrea (--only documentos,andamentos).",
  "Gerar as chaves VAPID, colocar no .env.production (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT), reiniciar o app e rodar install-cron.sh (passo a passo em docs/push.md); depois ligar os avisos do escritório em Minha conta.",
  "Publicação automática: seguir docs/deploy-github.md (repositório privado, chave de deploy, 4 segredos no GitHub, ambiente production com aprovação) e acompanhar a primeira publicação.",
  "Testar o aviso no celular real: Android (Chrome) e iPhone (app instalado na tela inicial).",
];
