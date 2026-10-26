/** Public research snapshot. Recheck original sources before updating prices or availability. */
export const PRICING_CHECKED_AT = "26/10/2026";
export const COMPETITORS = [
  {
    id: "legalmail", name: "LegalMail", focus: "Intimações, autos e peticionamento", source: "https://www.legalmail.com.br/", price: 187, basis: "por mês · Econômico",
    plans: [{ name: "Econômico", value: 187 }, { name: "Padrão", value: 297 }, { name: "Premium", value: 550 }, { name: "VIP", value: 997 }, { name: "Master", value: 2437 }],
    includes: ["Caixa de intimações", "Consulta aos autos", "Peticionamento e modelos"],
    limits: "Faixas de 150 a 5.000 processos importados. Acima disso, Exclusivo sob consulta.",
    note: "Média dos cinco planos pagos com preço público; não representa uma contratação equivalente ao LegalOS.",
  },
  {
    id: "advbox", name: "ADVBOX", focus: "Gestão jurídica e produtividade", source: "https://advbox.com.br/planos", price: 220, basis: "a partir de / mês · Essencial",
    plans: [{ name: "Essencial", value: 220 }, { name: "Banca Jurídica", value: 450 }, { name: "Banca Max", value: 900 }, { name: "Elite", value: 1800 }, { name: "Big Offices", value: 5000 }],
    includes: ["Processos, tarefas e documentos", "Financeiro conforme plano", "Automações e indicadores conforme plano"],
    limits: "Taxa de ativação adicional. Calculadora informa 1.000 processos ativos incluídos e acréscimos por volume.",
    note: "Elite: tabela R$ 1.800 e calculadora R$ 1.750. Média usa tabela e Big Offices; sem Big Offices: R$ 842,50.",
  },
  {
    id: "astrea", name: "Astrea", focus: "Rotina jurídica e gestão do escritório", source: "https://www.aurum.com.br/astrea/planos-e-precos/", price: 209, basis: "equivalente / mês · Up anual",
    plans: [{ name: "Up", value: 209 }, { name: "Smart", value: 379 }, { name: "Company", value: 689 }, { name: "VIP", value: 1249 }],
    includes: ["Clientes, processos e agenda", "Financeiro e portal do cliente", "Recursos de IA conforme plano"],
    limits: "Planos pagos: 2–30 usuários e 150–2.000 processos monitorados. Processos cadastrados ilimitados. Light gratuito por um ano, com limites próprios.",
    note: "Valores mensais equivalentes ao anual, não mensalidades sem compromisso anual. Smart mensal: R$ 439. Light e VIP+ fora da média.",
  },
  {
    id: "chatguru", name: "ChatGuru", focus: "Atendimento e automação por WhatsApp", source: "https://chatguru.com.br/planos-e-precos/", price: 119, basis: "a partir de / mês · anúncio geral",
    plans: [{ name: "Essencial", value: null }, { name: "Performance", value: null }, { name: "Profissional", value: null }, { name: "MEI / Enterprise", value: null }],
    includes: ["WhatsApp, chatbot e CRM", "Campanhas e distribuição", "Resumo e transcrição de áudio conforme plano"],
    limits: "Essencial: 2 usuários/1 número; Performance: 5/1; Profissional: 10/2. API oficial com taxas Meta/Gupshup.",
    note: "O anúncio de R$ 119 não identifica o plano ou a composição. Sem valores individuais publicados, não há média calculável.",
  },
] as const;

export function publishedPlanAverage(plans: readonly { value: number | null }[]) {
  const values = plans.map(p => p.value).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export const LEGALOS_PLANS = [
  { id: "simples", name: "Simples", subtitle: "O primeiro passo para organizar a rotina.", audience: "Para quem está começando e quer concentrar o essencial.", focus: ["Cadastro e organização dos clientes", "Casos, tarefas e agenda", "Documentos da rotina"], featured: false },
  { id: "basico", name: "Básico", subtitle: "Mais estrutura para o dia a dia.", audience: "Para o profissional que quer acompanhar o escritório com mais clareza.", focus: ["Operação jurídica no Func", "Acompanhamento de prazos e intimações", "Organização financeira"], featured: false },
  { id: "intermediario", name: "Intermediário", subtitle: "Equipe, atendimento e operação conectados.", audience: "Para escritórios que precisam coordenar pessoas e diferentes rotinas.", focus: ["Conexão entre Func, Box e Chat", "Fluxos de trabalho e colaboração", "Visão do cliente no Desktop"], featured: true },
  { id: "avancado", name: "Avançado", subtitle: "Uma operação com mais possibilidades.", audience: "Para equipes que buscam automações, inteligência e integrações.", focus: ["RUTE e governança da inteligência artificial", "API REST, MCP e webhooks", "Automações e acompanhamento gerencial"], featured: false },
] as const;

export type ComparisonCell = "yes" | "plan" | "unknown" | "conditional" | "validation";
export const COMPARISON_LABELS: Record<ComparisonCell, string> = {
  yes: "Disponível", plan: "Conforme plano", unknown: "Não confirmado", conditional: "Requer configuração", validation: "Em validação",
};
// A missing statement on a public page is never evidence that the competitor lacks a feature.
export const COMPARISON_ROWS: { label: string; legalos: ComparisonCell; legalmail: ComparisonCell; advbox: ComparisonCell; astrea: ComparisonCell; chatguru: ComparisonCell; note?: string }[] = [
  { label: "Cadastro de clientes", legalos: "yes", legalmail: "unknown", advbox: "yes", astrea: "yes", chatguru: "yes" },
  { label: "Gestão de processos jurídicos", legalos: "yes", legalmail: "yes", advbox: "yes", astrea: "yes", chatguru: "unknown" },
  { label: "Tarefas e agenda jurídica", legalos: "yes", legalmail: "unknown", advbox: "yes", astrea: "yes", chatguru: "unknown" },
  { label: "Captura de publicações / intimações", legalos: "conditional", legalmail: "yes", advbox: "plan", astrea: "plan", chatguru: "unknown" },
  { label: "Acesso aos autos do tribunal", legalos: "validation", legalmail: "yes", advbox: "unknown", astrea: "unknown", chatguru: "unknown", note: "LegalOS: repositório e visualização disponíveis; captura por tribunal depende de integração e homologação real." },
  { label: "Protocolo eletrônico no tribunal", legalos: "validation", legalmail: "yes", advbox: "unknown", astrea: "unknown", chatguru: "unknown", note: "LegalOS: fluxo interno de petições disponível; protocolo externo não foi homologado para todos os tribunais." },
  { label: "Modelos de documentos jurídicos", legalos: "yes", legalmail: "yes", advbox: "yes", astrea: "yes", chatguru: "unknown" },
  { label: "Gestão financeira do escritório", legalos: "yes", legalmail: "unknown", advbox: "plan", astrea: "plan", chatguru: "unknown" },
  { label: "CRM e funil comercial", legalos: "yes", legalmail: "unknown", advbox: "yes", astrea: "unknown", chatguru: "yes" },
  { label: "Atendimento em equipe no WhatsApp", legalos: "conditional", legalmail: "unknown", advbox: "unknown", astrea: "unknown", chatguru: "yes" },
  { label: "Campanhas de WhatsApp", legalos: "conditional", legalmail: "unknown", advbox: "unknown", astrea: "unknown", chatguru: "yes", note: "LegalOS: até 10 mil destinatários por campanha, aprovação, opt-out e lotes graduais. Taxas e regras do provedor se aplicam." },
  { label: "Recursos de inteligência artificial", legalos: "conditional", legalmail: "unknown", advbox: "plan", astrea: "plan", chatguru: "plan" },
  { label: "API para integrações", legalos: "conditional", legalmail: "yes", advbox: "plan", astrea: "unknown", chatguru: "yes" },
  { label: "MCP para ferramentas da IA", legalos: "conditional", legalmail: "unknown", advbox: "unknown", astrea: "unknown", chatguru: "unknown", note: "LegalOS: acesso externo por escopos e permissões. Compatibilidade precisa ser validada em cada cliente MCP." },
  { label: "Área de trabalho por cliente — Desktop", legalos: "yes", legalmail: "unknown", advbox: "unknown", astrea: "unknown", chatguru: "unknown", note: "Comparação da experiência específica do LegalOS Desktop; outras ferramentas podem ter painéis de cliente com abordagem diferente." },
];

export const formatBRL = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
