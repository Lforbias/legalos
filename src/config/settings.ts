import type { PermissionKey } from "@/lib/permissions/catalog";
export const SETTINGS_GROUPS = [
  { key: "office", title: "Escritório e equipe", description: "Dados do escritório, pessoas e permissões." },
  { key: "work", title: "Rotina de trabalho", description: "Personalize processos, tarefas e automações." },
  { key: "connections", title: "Tribunais e conexões", description: "Conecte as fontes e ferramentas do escritório." },
  { key: "security", title: "Segurança e privacidade", description: "Proteja o acesso e acompanhe as alterações." },
  { key: "billing", title: "Plano e cobrança", description: "Assinatura, consumo e créditos." },
];
export type SettingsItem = { href: string; label: string; description: string; group: string; permission?: PermissionKey };
export const SETTINGS_ITEMS: SettingsItem[] = [
  { href: "/configuracoes/implantacao", label: "Implantação do escritório", description: "Acompanhe a preparação das três etapas e as conferências da equipe.", group: "office", permission: "organization:manage" },
  { href: "/configuracoes/escritorio", label: "Dados do escritório", description: "Nome, identificação e fuso horário.", group: "office" },
  { href: "/configuracoes/equipe", label: "Equipe", description: "Membros, convites e acesso ao escritório.", group: "office", permission: "members:read" },
  { href: "/configuracoes/perfis", label: "Perfis de acesso", description: "Permissões de cada função.", group: "office", permission: "members:read" },
  { href: "/conta", label: "Minha conta", description: "Seus dados, senha e verificação em duas etapas.", group: "office" },
  { href: "/configuracoes/campos", label: "Campos personalizados", description: "Informações adicionais nos cadastros.", group: "work", permission: "cases:read" },
  { href: "/configuracoes/tarefas", label: "Tipos e etiquetas de tarefas", description: "Classificação e organização das atividades.", group: "work", permission: "tasks:read" },
  { href: "/tarefas/etapas", label: "Etapas de tarefas", description: "Colunas e etapas do quadro de trabalho.", group: "work", permission: "tasks:read" },
  { href: "/configuracoes/pacotes", label: "Pacotes de tarefas", description: "Sequências reutilizáveis de atividades.", group: "work", permission: "tasks:read" },
  { href: "/automacoes", label: "Automações", description: "Regras de distribuição e criação de tarefas.", group: "work", permission: "workflows:manage" },
  { href: "/integracoes", label: "Integrações", description: "DataJud, DJEN, tribunais, Google e API.", group: "connections", permission: "integrations:manage" },
  { href: "/configuracoes/credenciais", label: "Credenciais dos tribunais", description: "Seus acessos pessoais por sistema e tribunal.", group: "connections", permission: "cases:read" },
  { href: "/configuracoes/tribunais", label: "Sistemas dos tribunais", description: "Defina o sistema utilizado em cada tribunal.", group: "connections", permission: "integrations:manage" },
  { href: "/certificados", label: "Certificados digitais", description: "Certificados A1 e autorizações de uso.", group: "connections", permission: "certificates:manage" },
  { href: "/atendimento/configuracoes", label: "Configurar o Chat", description: "WhatsApp, expediente e respostas rápidas.", group: "connections", permission: "whatsapp:manage" },
  { href: "/configuracoes/ia", label: "IA do escritório", description: "Permissão de uso, provedor e perguntas sobre processos.", group: "connections", permission: "ai:use" },
  { href: "/rute?aba=situacao", label: "RUTE e inteligência artificial", description: "Ativação, provedor, conexões e instruções da assistente.", group: "connections", permission: "ai:use" },
  { href: "/configuracoes/seguranca", label: "Segurança", description: "Verificação em duas etapas, sessões e restrições de acesso.", group: "security", permission: "organization:manage" },
  { href: "/configuracoes/auditoria", label: "Auditoria", description: "Histórico das ações feitas no escritório.", group: "security", permission: "audit:read" },
  { href: "/configuracoes/plano", label: "Plano e uso", description: "Limites, assinatura, faturas e consumo.", group: "billing" },
  { href: "/configuracoes/creditos", label: "Créditos", description: "Saldo e consumo dos serviços do escritório.", group: "billing", permission: "billing:manage" },
];
