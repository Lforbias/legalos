import type { LucideIcon } from "lucide-react";
import {
  Scale,
  ShieldCheck,
  HeadphonesIcon,
  TrendingUp,
  Wallet,
  Settings2,
  Home,
  Monitor,
  CheckSquare,
  CalendarClock,
  FolderOpen,
  Hourglass,
  FileText,
  Calculator,
  MessageCircle,
  Users,
  Bot,
  Briefcase,
  BarChart3,
  UserSquare2,
  Plug,
  Zap,
  Globe,
  LayoutDashboard,
  FolderKanban,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions/catalog";

export type Department =
  | "lobby"
  | "mesa"
  | "juridico"
  | "controladoria"
  | "atendimento"
  | "comercial"
  | "financeiro"
  | "administracao";

export const DEPARTMENTS: Record<Department, { name: string; color: string; icon: LucideIcon; summary: string }> = {
  lobby: { name: "Meu Escritório", color: "#FF3B4E", icon: Home, summary: "Visão geral do escritório e atalhos rápidos." },
  mesa: { name: "Minha Mesa", color: "#FF3B4E", icon: Monitor, summary: "Suas tarefas, agenda e atividades pessoais." },
  juridico: { name: "Jurídico", color: "#6366f1", icon: Scale, summary: "Processos, prazos, documentos e cálculos." },
  controladoria: { name: "Controladoria", color: "#0ea5e9", icon: ShieldCheck, summary: "Distribuição de tarefas, prazos, agenda e pendências operacionais." },
  atendimento: { name: "Atendimento", color: "#10b981", icon: HeadphonesIcon, summary: "Conversas, clientes e copiloto de atendimento." },
  comercial: { name: "Comercial", color: "#f59e0b", icon: TrendingUp, summary: "CRM, leads e funil de conversão." },
  financeiro: { name: "Financeiro & Contábil", color: "#8b5cf6", icon: Wallet, summary: "Lançamentos, faturas e fluxo de caixa." },
  administracao: { name: "Administração & Gestão", color: "#64748b", icon: Settings2, summary: "Indicadores, equipe, integrações e configurações." },
};

export type EvolutionNavItem = {
  key: string;
  department: Department;
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  permissionAny?: PermissionKey[];
};

export const EVOLUTION_NAV: EvolutionNavItem[] = [
  // Minha Mesa
  { key: "evo-mesa", department: "mesa", label: "Minha Mesa", href: "/evolution/mesa", icon: Monitor },
  { key: "evo-mesa-tarefas", department: "mesa", label: "Tarefas", href: "/tarefas", icon: CheckSquare, permission: "tasks:read" },
  { key: "evo-mesa-agenda", department: "mesa", label: "Agenda", href: "/agenda", icon: CalendarClock, permission: "deadlines:read" },
  { key: "evo-mesa-workspace", department: "mesa", label: "Área de Trabalho", href: "/area-de-trabalho", icon: FolderOpen, permission: "clients:read" },
  { key: "evo-mesa-gestao", department: "mesa", label: "Gestão", href: "/gestao", icon: FolderKanban, permission: "tasks:read" },

  // Jurídico
  { key: "evo-juridico", department: "juridico", label: "Jurídico", href: "/evolution/juridico", icon: Scale },
  { key: "evo-juridico-processos", department: "juridico", label: "Processos", href: "/processos", icon: FolderOpen, permission: "cases:read" },
  { key: "evo-juridico-prazos", department: "juridico", label: "Prazos", href: "/prazos", icon: Hourglass, permission: "deadlines:read" },
  { key: "evo-juridico-documentos", department: "juridico", label: "Documentos", href: "/documentos", icon: FileText, permission: "documents:read" },
  { key: "evo-juridico-calculos", department: "juridico", label: "Cálculos", href: "/calculos", icon: Calculator, permission: "cases:read" },
  { key: "evo-juridico-ia", department: "juridico", label: "Inteligência artificial", href: "/ia", icon: Bot, permission: "ai:use" },

  // Controladoria
  { key: "evo-controladoria", department: "controladoria", label: "Controladoria", href: "/evolution/controladoria", icon: ShieldCheck },
  { key: "evo-controladoria-caixa", department: "controladoria", label: "Caixa de entrada", href: "/caixa-de-entrada", icon: FolderOpen, permission: "inbox:read" },
  { key: "evo-controladoria-alertas", department: "controladoria", label: "Central de alertas", href: "/alertas", icon: ShieldCheck },

  // Atendimento
  { key: "evo-atendimento", department: "atendimento", label: "Atendimento", href: "/evolution/atendimento", icon: HeadphonesIcon },
  { key: "evo-atendimento-conversas", department: "atendimento", label: "Conversas", href: "/atendimento", icon: MessageCircle, permission: "whatsapp:read" },
  { key: "evo-atendimento-clientes", department: "atendimento", label: "Clientes", href: "/clientes", icon: Users, permission: "clients:read" },
  { key: "evo-atendimento-copiloto", department: "atendimento", label: "Copiloto", href: "/copiloto", icon: Bot, permission: "ai:use" },
  { key: "evo-atendimento-config", department: "atendimento", label: "Configurar o Chat", href: "/atendimento/configuracoes", icon: Settings2, permission: "whatsapp:manage" },

  // Comercial
  { key: "evo-comercial", department: "comercial", label: "Comercial", href: "/evolution/comercial", icon: TrendingUp },
  { key: "evo-comercial-crm", department: "comercial", label: "CRM / Leads", href: "/crm", icon: Briefcase, permission: "crm:read" },
  { key: "evo-comercial-portal", department: "comercial", label: "Mensagens do portal", href: "/portal-equipe", icon: Globe, permission: "clients:read" },

  // Financeiro
  { key: "evo-financeiro", department: "financeiro", label: "Financeiro & Contábil", href: "/evolution/financeiro", icon: Wallet },
  { key: "evo-financeiro-lancamentos", department: "financeiro", label: "Lançamentos", href: "/financeiro", icon: Wallet, permission: "finance:read" },

  // Administração
  { key: "evo-administracao", department: "administracao", label: "Administração & Gestão", href: "/evolution/administracao", icon: Settings2 },
  { key: "evo-admin-indicadores", department: "administracao", label: "Indicadores", href: "/indicadores", icon: BarChart3 },
  { key: "evo-admin-equipe", department: "administracao", label: "Equipe", href: "/equipe", icon: UserSquare2, permission: "productivity:read" },
  { key: "evo-admin-integracoes", department: "administracao", label: "Integrações", href: "/integracoes", icon: Plug, permission: "integrations:manage" },
  { key: "evo-admin-automacoes", department: "administracao", label: "Automações", href: "/automacoes", icon: Zap, permission: "workflows:manage" },
  { key: "evo-admin-config", department: "administracao", label: "Configurações", href: "/configuracoes", icon: LayoutDashboard },
  { key: "evo-admin-reports", department: "administracao", label: "Relatórios e BI", href: "/relatorios", icon: BarChart3, permission: "reports:read" },
  { key: "evo-admin-rute", department: "administracao", label: "RUTE (IA)", href: "/rute", icon: Bot, permission: "ai:use" },
];

export function departmentItems(dept: Department) {
  return EVOLUTION_NAV.filter((n) => n.department === dept && n.key !== `evo-${dept}`);
}
