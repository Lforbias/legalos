/**
 * Novidades e andamento do LegalOS, mostradas no painel do developer (aba "Novidades e andamento").
 * MANTER EM DIA a cada entrega: acrescente a entrega em RELEASES, mude o status da fase em PHASES e, se for o caso, riscar a ação em TEAM_TODO.
 * (Espelha CHANGELOG.md e docs/roadmap-*.md, que não vão na imagem de produção.)
 */
export type PhaseStatus = "feita" | "em andamento" | "a fazer";

export type Release = { id: string; when: string; title: string; items: string[]; migration?: string };

/** Mais recente primeiro. */
export const RELEASES: Release[] = [
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
  { id: "3.0-F11", title: "Completar com o que aparecer nas telas do LegalMail", status: "a fazer" },
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
  { id: "6.0-F1", title: "Servidor MCP somente leitura (Claude, ChatGPT, Gemini consultam o LegalOS)", status: "a fazer" },
  { id: "6.0-F2", title: "Conectar as IAs: consentimento, passo a passo e conexões ativas", status: "a fazer" },
  { id: "6.0-F3", title: "Propostas da IA com confirmação humana", status: "a fazer" },
  { id: "6.0-F4", title: "Aba própria da RUTE no menu", status: "a fazer" },
  { id: "6.0-F5", title: "Assistente embutido com vários provedores", status: "a fazer" },
  { id: "6.0-F6", title: "IA nas telas de processo e cliente", status: "a fazer" },
  { id: "6.0-F7", title: "Biblioteca do escritório (instruções e modelos por área)", status: "a fazer" },
  { id: "6.0-F8", title: "Governança: limites, uso, retenção e LGPD", status: "a fazer" },
  { id: "6.0-F9", title: "Ações de maior risco, sempre com confirmação", status: "a fazer" },
];

export const TEAM_TODO: string[] = [
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
