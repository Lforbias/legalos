/**
 * Conteúdo da página pública /produto. REGRA: só o que existe e foi verificado; nada de cliente, depoimento, preço ou número inventado.
 * Os números abaixo foram conferidos no código e nos testes em 2026-10-21 (atualizar a cada entrega, junto com src/lib/updates.ts).
 */
export const FACTS = {
  spaces: 3,
  permissions: 41,
  tables: 109,
  tests: 732,
  e2e: 48,
} as const;

export type ModuleShot = { id: string; label: string; image: string; alt: string; title: string; text: string; points: string[] };

export const MODULES: ModuleShot[] = [
  {
    id: "processos", label: "Processos", image: "/produto/processo.webp", alt: "Tela de um processo no LegalOS com dados, vínculos e conversa de WhatsApp",
    title: "Cada processo, com tudo o que importa num lugar só",
    text: "Dados, partes, linha do tempo, prazos, tarefas, intimações, documentos e petições, ligados ao cliente e à conversa de WhatsApp daquele caso.",
    points: ["Número CNJ validado pelo dígito verificador", "Consulta de andamentos pelo DataJud do CNJ", "Compartilhamento opcional com o portal do cliente, só do que você marcar", "Processos sigilosos visíveis apenas a quem tem acesso"],
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
    text: "Painel com membros, clientes, processos, prazos em aberto e vencidos, tarefas pessoais, intimações novas e atividade do escritório.",
    points: ["Indicadores calculados dos dados reais", "Três espaços de trabalho com identidade própria: Func, Box e Chat", "Tema escuro e claro", "Instalável no celular como aplicativo (PWA)"],
  },
  {
    id: "relatorios", label: "Relatórios", image: "/produto/relatorios.webp", alt: "Relatórios e indicadores do escritório",
    title: "Relatórios e indicadores com exportação",
    text: "Acompanhe carteira, produtividade da equipe e financeiro, com abas por permissão e exportação em planilha.",
    points: ["Abas liberadas conforme o perfil de cada pessoa", "Produtividade da equipe e registro de horas", "Exportação em CSV", "Período validado, com mensagens claras"],
  },
];

export const SPACES = [
  { name: "LegalOS Func", tone: "#3565f0", text: "A gestão do escritório: clientes, processos, tarefas, prazos, agenda, documentos, financeiro, CRM e relatórios.", items: ["Clientes e processos", "Tarefas, prazos e agenda", "Financeiro e relatórios", "Portal do cliente"] },
  { name: "LegalOS Box", tone: "#0f8f83", text: "A caixa de intimações e o peticionamento: captura, distribuição, certificados digitais e integrações com tribunais.", items: ["Caixa de entrada jurídica", "DJEN e DataJud", "Cofre de certificados A1", "Petições e conector PJe/MNI"] },
  { name: "LegalOS Chat", tone: "#e0a800", text: "O atendimento por WhatsApp, ligado a cliente, processo, tarefas e financeiro.", items: ["Filas e etiquetas", "Robô e automações", "Painel do cliente na conversa", "Interruptores de tudo que é automático"] },
] as const;

/** Futuro, ainda NÃO disponível. Mostrado na página do produto como "em planejamento". */
export const FUTURE_AI = {
  name: "RUTE",
  tone: "#d7263d",
  text: "A IA do LegalOS, com nome próprio: uma aba só dela no menu. Conecte o Claude, o ChatGPT ou o Gemini ao LegalOS, ou converse com um assistente dentro do sistema. A IA lê o que o seu perfil permite e propõe; só grava depois da confirmação de uma pessoa.",
  items: ["Conexão por MCP com as IAs que a equipe já usa", "Aba própria da RUTE no menu", "Propostas que só valem depois de confirmadas", "Limites, auditoria e controle do que foi enviado"],
} as const;

export const SECURITY = [
  { title: "Escritórios totalmente separados", text: "Cada escritório só enxerga os próprios dados. A separação é verificada por testes automatizados." },
  { title: "Permissões granulares", text: `${FACTS.permissions} permissões combináveis em perfis (proprietário, administrador, advogado, financeiro, assistente e mais), com o mínimo de acesso por padrão.` },
  { title: "Verificação em duas etapas (2FA)", text: "Código do aplicativo autenticador e códigos de recuperação. Exigida de administradores da plataforma e em integrações sensíveis, como webhooks." },
  { title: "Trilha de auditoria", text: "Quem fez o quê, quando e de onde. Falhas e acessos negados também ficam registrados." },
  { title: "Cofre cifrado", text: "Certificados digitais A1 e chaves de integração guardados cifrados; nenhuma chave aparece na tela depois de salva." },
  { title: "Backups cifrados", text: "Cópia diária do banco e dos documentos, cifrada, com rotina de verificação e restauração documentadas." },
] as const;

export const HONESTY = [
  { title: "Nada é falso", text: "Se uma integração não está configurada, o sistema avisa. Ele não simula resposta, não inventa dado e não finge que enviou." },
  { title: "Nada sai sem autorização", text: "Mensagens a clientes, cobranças e protocolos dependem de decisão humana. Toda automação tem seu botão de ligar e desligar." },
  { title: "IA só com chave real e supervisão", text: "Os recursos de IA ficam desligados até o escritório configurar a chave do provedor. Mascaram CPF e CNPJ e só sugerem: uma pessoa decide." },
] as const;

export const INTEGRATIONS: { name: string; note?: string }[] = [
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
