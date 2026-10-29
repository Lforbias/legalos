import { BOX_AVAILABLE } from "@/lib/box-retirement";
/**
 * Conteúdo da página pública /produto. REGRA: só o que existe e foi verificado; nada de cliente, depoimento, preço ou número inventado.
 * Os números abaixo foram conferidos no código e nos testes em 2026-10-22 (atualizar a cada entrega, junto com src/lib/updates.ts).
 */
export const FACTS = {
  spaces: 2,
  permissions: 41,
  tables: 129,
  tests: 830,
  e2e: 48,
} as const;

export type ModuleShot = { id: string; label: string; image: string; alt: string; title: string; text: string; points: string[] };

const ALL_MODULES: ModuleShot[] = [
  {
    id: "processos", label: "Processos", image: "/produto/processo.webp", alt: "Tela de um processo no LegalOS com dados, vínculos e conversa de WhatsApp",
    title: "Cada processo, com tudo o que importa num lugar só",
    text: "Dados, partes, linha do tempo, prazos, tarefas e documentos, ligados ao cliente e à conversa de WhatsApp daquele caso.",
    points: ["Número CNJ validado pelo dígito verificador", "Registro de andamentos do processo", "Compartilhamento opcional com o portal do cliente, só do que você marcar", "Processos sigilosos visíveis apenas a quem tem acesso"],
  },
  {
    id: "caixa", label: "Intimações", image: "/produto/caixa.webp", alt: "Caixa de entrada jurídica com intimações novas e contadores do dia",
    title: "Intimações que chegam, são distribuídas e viram prazo",
    text: "Uma caixa central para publicações e intimações, com contadores do dia, distribuição para quem vai tratar e transformação em tarefa ou prazo em poucos cliques.",
    points: ["Captura do DJEN por OAB, com aviso quando um nome monitorado para de ser verificado", "Cada monitoramento pode enviar direto para um membro ou uma equipe", "Aviso de possíveis duplicadas", "Sugestão de providência por IA, opcional, que só sugere: nada é criado sem uma pessoa conferir"],
  },
  {
    id: "chat", label: "LegalOS Chat", image: "/produto/atendimento.webp", alt: "Atendimento por WhatsApp em três colunas, com painel do cliente e processo vinculados",
    title: "WhatsApp do escritório, ligado ao resto do sistema",
    text: "Atendimento em equipe com fila, etiquetas e respostas rápidas. A conversa já mostra o cliente, o processo, as tarefas e o financeiro, e permite criar tarefa ou prazo na hora.",
    points: ["API oficial da Meta ou conexão por QR-Code", "Filas, etiquetas, atribuição e notas internas", "Robô, mensagem de ausência e automações, cada um com botão de ligar e desligar", "Nada é enviado a cliente sem autorização: a cobrança por WhatsApp nasce desligada"],
  },
  {
    id: "prazos", label: "Prazos e agenda", image: "/produto/prazos.webp", alt: "Lista de prazos com datas fatais, responsáveis e situação",
    title: "Prazos calculados e conferidos por uma pessoa",
    text: "Cálculo em dias úteis ou corridos a partir da ciência, data fatal e data interna, responsável e situação. O prazo nasce como rascunho e só vale depois de validado.",
    points: ["Validação humana antes de o prazo valer", "Agenda de audiências, reuniões e diligências", "Lista de tarefas com prioridade, responsável e vínculo com o processo", "Notificações dentro do sistema"],
  },
  {
    id: "financeiro", label: "Financeiro", image: "/produto/financeiro.webp", alt: "Financeiro com contas a receber, a pagar, fluxo de caixa e saldo das contas",
    title: "Honorários e despesas sob controle",
    text: "Contas a receber e a pagar, parcelas, baixas, fluxo de caixa por mês e saldo das contas, sempre em reais e calculado sem arredondamento de ponto flutuante.",
    points: ["Lançamentos parcelados, vinculados a cliente e processo", "Categorias, centros de custo e várias contas", "Cobrança da assinatura pelo Asaas (Pix, boleto e cartão), pronta para ser ativada", "Lembretes de cobrança de honorários por WhatsApp, desligados até você autorizar", "Exportação de relatórios em planilha"],
  },
  {
    id: "painel", label: "Visão geral", image: "/produto/painel.webp", alt: "Painel inicial com indicadores do escritório",
    title: "O escritório inteiro num só olhar",
    text: "Painel com membros, clientes, processos, prazos em aberto e vencidos, tarefas pessoais e atividade do escritório.",
    points: ["Indicadores calculados dos dados reais", "Func e Chat com identidade própria", "Tema escuro e claro", "Instalável no celular como aplicativo (PWA)"],
  },
  {
    id: "relatorios", label: "Relatórios", image: "/produto/relatorios.webp", alt: "Relatórios e indicadores do escritório",
    title: "Relatórios e indicadores com exportação",
    text: "Acompanhe carteira, produtividade da equipe e financeiro, com abas por permissão e exportação em planilha.",
    points: ["Abas liberadas conforme o perfil de cada pessoa", "Produtividade da equipe e registro de horas", "Exportação em CSV", "Período validado, com mensagens claras"],
  },
  {
    id: "rute", label: "RUTE · Assistente", image: "/produto/rute-assistente.webp", alt: "Assistente RUTE respondendo o que fazer hoje, com as consultas feitas e uma proposta de tarefa",
    title: "A RUTE: a IA do escritório, dentro do LegalOS",
    text: "Pergunte em linguagem natural o que tem para hoje, quais prazos vencem ou o que há de novo num processo. A RUTE consulta o sistema com as suas permissões e mostra de onde tirou cada resposta.",
    points: ["Conversa privada de cada pessoa; só enxerga o que o perfil dela já pode ver", "CPF, CNPJ e e-mails são ocultados antes de sair para a IA", "Funciona com Claude, Gemini ou OpenAI, com a chave do escritório", "Botão RUTE nas telas de processo e de cliente abre a conversa já no contexto"],
  },
  {
    id: "rute-propostas", label: "RUTE · Propostas", image: "/produto/rute-propostas.webp", alt: "Lista de propostas da IA aguardando decisão, com texto editável e confirmação reforçada",
    title: "A IA propõe. Uma pessoa decide.",
    text: "Tarefa, prazo em rascunho, anotação, minuta, andamento e petição em rascunho viram propostas. Você lê, edita se quiser e aprova. Só então o sistema cria.",
    points: ["Nada é criado, alterado ou enviado sem confirmação humana", "Ações de maior risco pedem confirmação reforçada", "Nunca protocola e nada fala com cliente", "Tudo fica registrado: quem propôs, quem aprovou e quando"],
  },
  {
    id: "rute-conexoes", label: "RUTE · Conexões", image: "/produto/rute-conexoes.webp", alt: "Conexão do LegalOS com Claude, ChatGPT e Gemini, com passo a passo e lista de conexões",
    title: "Conecte o Claude, o ChatGPT ou o Gemini ao LegalOS",
    text: "Quem já usa uma dessas IAs no dia a dia conecta com o login do LegalOS e passa a consultar o escritório de dentro dela, com as mesmas permissões.",
    points: ["Login com consentimento e verificação em duas etapas, ou chave de acesso", "Botão de testar a conexão e lista de conexões com revogar", "Parada de emergência que corta tudo na hora", "Nasce desligada: o escritório liga quando quiser"],
  },
  {
    id: "rute-biblioteca", label: "RUTE · Biblioteca", image: "/produto/rute-biblioteca.webp", alt: "Biblioteca do escritório com instruções e modelos por área",
    title: "A IA trabalha do jeito do escritório",
    text: "Cadastre as instruções (tom das peças, checklists) e os modelos por área. A RUTE segue o que o escritório definiu, e você pode baixar um pacote para usar no Claude.",
    points: ["Instruções e modelos por área do direito", "Só o conteúdo ativo é usado", "Pacote para o Claude em um clique", "Sem dados de clientes na biblioteca"],
  },
  {
    id: "rute-governanca", label: "RUTE · Governança", image: "/produto/rute-governanca.webp", alt: "Governança da RUTE com limites, uso em tokens e relatório de LGPD",
    title: "Controle de uso, limites e LGPD",
    text: "Defina limites por escritório e por perfil, acompanhe o uso do mês e veja o que saiu do sistema para a IA, por cliente e por processo.",
    points: ["Limite mensal por perfil e por escritório", "Relatório de uso por pessoa", "Relatório de LGPD com exportação em CSV, sem o texto das perguntas", "Retenção das conversas configurável"],
  },
  {
    id: "calculos", label: "Cálculos", image: "/produto/calculo.webp", alt: "Calculadora jurídica com atrasados da Justiça Federal, TJSP, trabalhista e prazos",
    title: "Calculadoras jurídicas dentro do processo",
    text: "Atrasados da Justiça Federal, débito do TJSP, atualização trabalhista, verbas rescisórias e prazos, salvos no processo com memorial e planilha.",
    points: ["Índices oficiais do Banco Central; o que faltar o escritório lança e o sistema nunca inventa índice", "Exportação em Excel, CSV e memorial", "Ferramenta de apoio: confira sempre com a decisão", "Resultado calculado no servidor, nunca no navegador"],
  },
  {
    id: "copiloto", label: "Copiloto", image: "/produto/copiloto.webp", alt: "Copiloto de atendimento com resumo, ações que podem caber, tarefas e documentos sugeridos",
    title: "Do atendimento para o trabalho, sem redigitar",
    text: "Cole a transcrição (ou envie o áudio) e receba resumo, ações que podem caber, tarefas e documentos a pedir. Só vira tarefa o que uma pessoa marcar.",
    points: ["Tudo em rascunho, revisado por uma pessoa", "Nada é enviado ao cliente", "CPF e CNPJ ocultados antes de ir para a IA", "Transcrição de áudio opcional"],
  },
  {
    id: "metas", label: "Metas da equipe", image: "/produto/metas.webp", alt: "Metas mensais por pessoa e carga de trabalho por peso",
    title: "Metas do mês e carga de trabalho por peso",
    text: "Metas por pessoa e da equipe (tarefas, pontos, prazos, horas), progresso do mês e carga por peso, com sugestão de distribuição que uma pessoa confirma.",
    points: ["Números vindos das tarefas, prazos e horas reais", "Carga por pontos do tipo de tarefa", "Sugestão de distribuição das tarefas sem responsável", "Quem decide é sempre uma pessoa"],
  },
];

const ALL_SPACES = [
  { name: "LegalOS Func", tone: "#7C8CFF", text: "A gestão do escritório: clientes, processos, tarefas, prazos, agenda, documentos, financeiro, CRM e relatórios.", items: ["Clientes e processos", "Tarefas, prazos e agenda", "Financeiro e relatórios", "Portal do cliente"] },
  { name: "LegalOS Box", tone: "#0f8f83", text: "A caixa de intimações e o peticionamento: captura, distribuição, certificados digitais e integrações com tribunais.", items: ["Caixa de entrada jurídica", "DJEN e DataJud", "Cofre de certificados A1", "Petições e conector PJe/MNI"] },
  { name: "LegalOS Chat", tone: "#e0a800", text: "WhatsApp ligado à rotina jurídica e caixa de e-mail compartilhada, com configuração por escritório.", items: ["Filas, etiquetas, macros e listas salvas", "Copiloto com revisão humana", "Campanhas com aprovação e agendamento", "E-mail IMAP/SMTP e respostas em texto"] },
] as const;

/** A RUTE já está disponível (6.0). Nasce desligada em cada escritório. */
export const RUTE_INFO = {
  name: "RUTE",
  tone: "#d7263d",
  text: "A IA do LegalOS, com nome próprio e uma aba só dela no menu. Conecte o Claude, o ChatGPT ou o Gemini ao LegalOS, ou converse com o assistente dentro do sistema. A IA consulta os dados permitidos pelo seu perfil. No modo Criar e alterar, executa os comandos disponíveis quando você pede explicitamente; propostas continuam exigindo revisão e confirmação.",
  items: ["Conexão com as IAs que a equipe já usa", "Assistente embutido, com contexto de processo e cliente", "Propostas que só valem depois de confirmadas", "Biblioteca do escritório, limites, auditoria e relatório de LGPD"],
} as const;

/** Em breve (fila da 7.0). Nada disso existe ainda; só entra aqui o que está na fila aprovada. */
export const COMING_SOON = [
  "Conversa por voz contínua, com interrupção e confirmação falada",
  "RUTE faz tarefas pequenas sozinha, com interruptor por ação",
  "Resumo da manhã de cada pessoa",
  "Preparar audiência e conferir peça antes de protocolar",
  "Assinatura de contrato e procuração no sistema",
  "Pedido de documentos ao cliente por link",
  "Previsão de caixa e repasse de valores ao cliente",
  "Busca única e modo audiência no celular",
] as const;

export const SECURITY = [
  { title: "Escritórios totalmente separados", text: "Cada escritório só enxerga os próprios dados. A separação é verificada por testes automatizados." },
  { title: "Permissões granulares", text: `${FACTS.permissions} permissões combináveis em perfis (proprietário, administrador, advogado, financeiro, assistente e mais), com o mínimo de acesso por padrão.` },
  { title: "Verificação em duas etapas (2FA)", text: "Código do aplicativo autenticador e códigos de recuperação. Exigida de administradores da plataforma e em integrações sensíveis, como webhooks." },
  { title: "Trilha de auditoria", text: "Quem fez o quê, quando e de onde. Falhas e acessos negados também ficam registrados." },
  { title: "Cofre cifrado", text: "Chaves de integração guardadas cifradas; nenhuma chave aparece na tela depois de salva." },
  { title: "Backups cifrados", text: "Cópia diária do banco e dos documentos, cifrada, com rotina de verificação e restauração documentadas." },
] as const;

export const HONESTY = [
  { title: "Nada é falso", text: "Se uma integração não está configurada, o sistema avisa. Ele não simula resposta, não inventa dado e não finge que enviou." },
  { title: "Nada sai sem autorização", text: "Mensagens a clientes e cobranças dependem de decisão humana. Toda automação tem seu botão de ligar e desligar." },
  { title: "IA só com chave real e supervisão", text: "Os recursos de IA ficam desligados até o escritório configurar a chave do provedor. Mascaram CPF e CNPJ e só sugerem: uma pessoa decide." },
] as const;

const ALL_INTEGRATIONS: { name: string; note?: string }[] = [
  { name: "DJEN" }, { name: "DataJud (CNJ)" }, { name: "WhatsApp Meta e QR-Code" }, { name: "Asaas" },
  { name: "PJe / MNI", note: "conector pronto, em validação" }, { name: "SMTP (e-mail)" }, { name: "API pública v1" }, { name: "Webhooks assinados" },
];

/** App no celular (PWA). Só o que já existe e foi verificado; os avisos no celular (push) ainda NÃO existem e ficam em "próximas entregas". */
export const PWA = {
  title: "No celular, como aplicativo",
  text: "Abra o LegalOS no navegador do celular e instale na tela inicial: ele abre em tela cheia, com ícone próprio, sem passar pela loja de aplicativos.",
  points: [
    { title: "Instala em Android e iPhone", text: "Android pelo Chrome; iPhone pelo Safari, em Compartilhar → Adicionar à Tela de Início." },
    { title: "Abre como um app", text: "Tela cheia, ícone na tela inicial e o mesmo login e as mesmas permissões do computador." },
    { title: "Sem internet, sem dado exposto", text: "Sem conexão, aparece uma tela avisando. Nenhum dado de cliente fica guardado no aparelho para uso offline." },
    { title: "Avisos de vencimento no celular", text: "Opcional e ligado pelo administrador: cada pessoa escolhe ativar no próprio aparelho e recebe um aviso quando prazos ou tarefas suas estiverem perto de vencer. O aviso mostra só a quantidade, nunca nome de cliente nem número de processo." },
    { title: "Sempre na versão atual", text: "Atualiza sozinho quando o escritório publica uma versão nova, sem baixar nada." },
  ],
} as const;

export const MODULES = ALL_MODULES.filter(m => BOX_AVAILABLE || m.id !== "caixa");
export const SPACES = ALL_SPACES.filter(s => BOX_AVAILABLE || s.name !== "LegalOS Box");

export const INTEGRATIONS = ALL_INTEGRATIONS.filter(i => BOX_AVAILABLE || !["DJEN", "PJe / MNI", "DataJud (CNJ)"].includes(i.name));
