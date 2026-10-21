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
  { id: "2.0-F3", title: "Kanban de gestão e workflows do escritório", status: "a fazer" },
  { id: "2.0-F4", title: "Financeiro: fluxo de caixa, contas, faturas", status: "a fazer" },
  { id: "2.0-F5", title: "Processo mais rico (honorário, apensos, recursos, provisão)", status: "a fazer" },
  { id: "2.0-F6", title: "Pequenos itens (aniversariantes, 2FA obrigatório, exportar Excel, enviar por WhatsApp)", status: "feita" },
  { id: "2.0-F7", title: "Migração Astrea (modelos, certificado, andamentos)", status: "a fazer" },
  { id: "2.0-F8", title: "Chat: vários números e relatórios", status: "a fazer" },
  { id: "2.0-F9", title: "Chat: follow-ups, agendadas, NPS, exportação, formulários", status: "a fazer" },
  { id: "2.0-F10", title: "IA com chave real (resumo, jurisprudência, peças)", status: "a fazer" },
  { id: "2.0-F11", title: "Cofre de credenciais de clientes e perfis mínimos", status: "a fazer" },
  { id: "2.0-F14", title: "Avisos no celular (push) de tarefas e prazos a vencer", status: "feita" },
  { id: "2.0-F15", title: "Comunicados do developer: enviar aviso no celular e no sistema para todos os escritórios, um escritório ou uma pessoa", status: "feita" },
  { id: "2.0-F12", title: "Fechamento: revisão geral e versão 2.0.0", status: "a fazer" },
];

export const PHASES_3: Phase[] = [
  { id: "3.0-F1", title: "Cadastro único de partes, campos personalizados, arquivar, notas fixas e em lote", status: "feita" },
  { id: "3.0-F2", title: "Tarefas 2.0 (tipos com pontuação, etiquetas, menções, anexos, histórico)", status: "a fazer" },
  { id: "3.0-F3", title: "Autotextos com variáveis, timbrados e prévia em PDF", status: "a fazer" },
  { id: "3.0-F4", title: "Importação de processos em lote e download de autos", status: "a fazer" },
  { id: "3.0-F5", title: "Fila de protocolos, recibo, agendamento e cancelamento", status: "a fazer" },
  { id: "3.0-F6", title: "Conectores de peticionamento além do MNI", status: "a fazer" },
  { id: "3.0-F7", title: "Monitoramento de intimações nos sistemas dos tribunais", status: "a fazer" },
  { id: "3.0-F8", title: "Classificação de documentos por IA", status: "a fazer" },
  { id: "3.0-F9", title: "Certificado com usuários autorizados e webhooks de protocolo", status: "a fazer" },
  { id: "3.0-F10", title: "Créditos e custos", status: "a fazer" },
  { id: "3.0-F11", title: "Completar com o que aparecer nas telas do LegalMail", status: "a fazer" },
];

export const PHASES_4: Phase[] = [
  { id: "4.0-F1", title: "Etiquetas pré-definidas, menção a colega e encaminhar a vários chats", status: "a fazer" },
  { id: "4.0-F2", title: "Biblioteca de arquivos e checklists enviáveis no chat", status: "a fazer" },
  { id: "4.0-F3", title: "Vários números de WhatsApp com status e reconexão", status: "a fazer" },
  { id: "4.0-F4", title: "Status de chat e arquivamento automático", status: "a fazer" },
  { id: "4.0-F5", title: "Bot 2.0: horário, audiência/perícia, aniversário, timer e delegador", status: "a fazer" },
  { id: "4.0-F6", title: "Relatórios de atendimento e exportação agendada", status: "a fazer" },
  { id: "4.0-F7", title: "Campanhas em massa controladas", status: "a fazer" },
  { id: "4.0-F8", title: "NPS pós-atendimento", status: "a fazer" },
  { id: "4.0-F9", title: "Intenções, transcrição e resumo por IA", status: "a fazer" },
  { id: "4.0-F10", title: "Módulos por plano e segurança da conta", status: "a fazer" },
  { id: "4.0-F11", title: "Completar com o que aparecer nas telas ainda não vistas do ChatGuru", status: "a fazer" },
];

export const PHASES_5: Phase[] = [
  { id: "5.0-F1", title: "Calculadoras no sistema (atrasados JF, débitos TJSP, trabalhista e prazos)", status: "a fazer" },
  { id: "5.0-F2", title: "Portal do cliente com andamento em linguagem simples", status: "a fazer" },
  { id: "5.0-F3", title: "Cobrança de honorários por Pix e boleto com baixa automática", status: "a fazer" },
  { id: "5.0-F4", title: "Triagem de publicações com minuta (IA, com validação humana)", status: "a fazer" },
  { id: "5.0-F5", title: "Copiloto de atendimento (transcrição, resumo e ações)", status: "a fazer" },
  { id: "5.0-F6", title: "Metas e carga de trabalho por pessoa", status: "a fazer" },
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
  "Manter a cobrança pelo WhatsApp DESLIGADA até a Dra. Talita autorizar.",
  "Trocar a chave de API do ChatGuru (ela apareceu no chat) e, depois, reinstalar o agendador no servidor (install-cron.sh) para ativar a rotina chat-sla.",
  "Configurar fila e atendente de cada área em Configurações do Chat → Triagem por área; depois ligar SLA e regras.",
  "Religar o 2FA da conta lforbiano e guardar os códigos de recuperação.",
  "Trocar os segredos que apareceram no chat (rotate-secrets.sh).",
  "Configurar a cópia do backup fora do servidor (BACKUP_OFFSITE).",
  "Configurar o SMTP e rodar o mail-test.",
  "Ciclo completo no Asaas sandbox.",
  "Importar andamentos do Astrea (--only andamentos --dry-run, conferir, depois --yes).",
  "Fornecer a chave do provedor de IA quando chegar a F10.",
  "Gerar as chaves VAPID, colocar no .env.production (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT), reiniciar o app e rodar install-cron.sh (passo a passo em docs/push.md); depois ligar os avisos do escritório em Minha conta.",
  "Publicação automática: seguir docs/deploy-github.md (repositório privado, chave de deploy, 4 segredos no GitHub, ambiente production com aprovação) e acompanhar a primeira publicação.",
  "Testar o aviso no celular real: Android (Chrome) e iPhone (app instalado na tela inicial).",
];
