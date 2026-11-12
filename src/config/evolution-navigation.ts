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
  lobby: { name: "Meu Escritório", color: "hsl(var(--primary))", icon: Home, summary: "Visão geral do escritório e atalhos rápidos." },
  mesa: { name: "Minha Mesa", color: "hsl(var(--primary))", icon: Monitor, summary: "Suas tarefas, agenda e atividades pessoais." },
  juridico: { name: "Jurídico", color: "#6366f1", icon: Scale, summary: "Processos, prazos, documentos e cálculos." },
  controladoria: { name: "Controladoria", color: "#0ea5e9", icon: ShieldCheck, summary: "Publicações, caixa de entrada e monitoramento judicial." },
  atendimento: { name: "Atendimento", color: "#10b981", icon: HeadphonesIcon, summary: "Conversas, clientes e copiloto de atendimento." },
  comercial: { name: "Comercial", color: "#f59e0b", icon: TrendingUp, summary: "CRM, leads e funil de conversão." },
  financeiro: { name: "Financeiro & Contábil", color: "#8b5cf6", icon: Wallet, summary: "Lançamentos, faturas e fluxo de caixa." },
  administracao: { name: "Administração & Gestão", color: "#64748b", icon: Settings2, summary: "Indicadores, equipe, integrações e configurações." },
};

export type EvolutionNavItem = {
  key: string;
  department: Department;
  label: string;
  /** Path within Evolution for the department landing page, or existing route for deep links. */
  href: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  permissionAny?: PermissionKey[];
  /** When set, this links to an existing Ethos route rather than an Evolution page. */
  existingRoute?: boolean;
};

export const EVOLUTION_NAV: EvolutionNavItem[] = [
  // Minha Mesa
  { key: "evo-mesa", department: "mesa", label: "Minha Mesa", href: "/evolution/mesa", icon: Monitor },
  { key: "evo-mesa-tarefas", department: "mesa", label: "Tarefas", href: "/tarefas", icon: CheckSquare, permission: "tasks:read", existingRoute: true },
  { key: "evo-mesa-agenda", department: "mesa", label: "Agenda", href: "/agenda", icon: CalendarClock, permission: "deadlines:read", existingRoute: true },

  // Jurídico
  { key: "evo-juridico", department: "juridico", label: "Jurídico", href: "/evolution/juridico", icon: Scale },
  { key: "evo-juridico-processos", department: "juridico", label: "Processos", href: "/processos", icon: FolderOpen, permission: "cases:read", existingRoute: true },
  { key: "evo-juridico-prazos", department: "juridico", label: "Prazos", href: "/prazos", icon: Hourglass, permission: "deadlines:read", existingRoute: true },
  { key: "evo-juridico-documentos", department: "juridico", label: "Documentos", href: "/documentos", icon: FileText, permission: "documents:read", existingRoute: true },
  { key: "evo-juridico-calculos", department: "juridico", label: "Cálculos", href: "/calculos", icon: Calculator, permission: "cases:read", existingRoute: true },

  // Controladoria
  { key: "evo-controladoria", department: "controladoria", label: "Controladoria", href: "/evolution/controladoria", icon: ShieldCheck },
  { key: "evo-controladoria-caixa", department: "controladoria", label: "Caixa de entrada", href: "/caixa-de-entrada", icon: FolderOpen, permission: "inbox:read", existingRoute: true },
  { key: "evo-controladoria-alertas", department: "controladoria", label: "Central de alertas", href: "/alertas", icon: ShieldCheck, existingRoute: true },

  // Atendimento
  { key: "evo-atendimento", department: "atendimento", label: "Atendimento", href: "/evolution/atendimento", icon: HeadphonesIcon },
  { key: "evo-atendimento-conversas", department: "atendimento", label: "Conversas", href: "/atendimento", icon: MessageCircle, permission: "whatsapp:read", existingRoute: true },
  { key: "evo-atendimento-clientes", department: "atendimento", label: "Clientes", href: "/clientes", icon: Users, permission: "clients:read", existingRoute: true },
  { key: "evo-atendimento-copiloto", department: "atendimento", label: "Copiloto", href: "/copiloto", icon: Bot, permission: "ai:use", existingRoute: true },

  // Comercial
  { key: "evo-comercial", department: "comercial", label: "Comercial", href: "/evolution/comercial", icon: TrendingUp },
  { key: "evo-comercial-crm", department: "comercial", label: "CRM / Leads", href: "/crm", icon: Briefcase, permission: "crm:read", existingRoute: true },
  { key: "evo-comercial-portal", department: "comercial", label: "Portal do cliente", href: "/portal", icon: Globe, permission: "portal:access", existingRoute: true },

  // Financeiro
  { key: "evo-financeiro", department: "financeiro", label: "Financeiro & Contábil", href: "/evolution/financeiro", icon: Wallet },
  { key: "evo-financeiro-lancamentos", department: "financeiro", label: "Lançamentos", href: "/financeiro", icon: Wallet, permission: "finance:read", existingRoute: true },

  // Administração
  { key: "evo-administracao", department: "administracao", label: "Administração & Gestão", href: "/evolution/administracao", icon: Settings2 },
  { key: "evo-admin-indicadores", department: "administracao", label: "Indicadores", href: "/indicadores", icon: BarChart3, existingRoute: true },
  { key: "evo-admin-equipe", department: "administracao", label: "Equipe", href: "/equipe", icon: UserSquare2, permission: "productivity:read", existingRoute: true },
  { key: "evo-admin-integracoes", department: "administracao", label: "Integrações", href: "/integracoes", icon: Plug, permission: "integrations:manage", existingRoute: true },
  { key: "evo-admin-automacoes", department: "administracao", label: "Automações", href: "/automacoes", icon: Zap, permission: "workflows:manage", existingRoute: true },
  { key: "evo-admin-config", department: "administracao", label: "Configurações", href: "/configuracoes", icon: LayoutDashboard, existingRoute: true },
];

export function departmentItems(dept: Department) {
  return EVOLUTION_NAV.filter((n) => n.department === dept && n.key !== `evo-${dept}`);
}

/** Map from old Ethos routes to Evolution departments for traceability. */
export const ROUTE_MATRIX: { ethos: string; evolution: Department; description: string }[] = [
  { ethos: "/dashboard", evolution: "lobby", description: "Dashboard → Lobby do escritório" },
  { ethos: "/tarefas", evolution: "mesa", description: "Tarefas → Minha Mesa > Tarefas" },
  { ethos: "/agenda", evolution: "mesa", description: "Agenda → Minha Mesa > Agenda" },
  { ethos: "/processos", evolution: "juridico", description: "Processos → Jurídico > Processos" },
  { ethos: "/prazos", evolution: "juridico", description: "Prazos → Jurídico > Prazos" },
  { ethos: "/documentos", evolution: "juridico", description: "Documentos → Jurídico > Documentos" },
  { ethos: "/calculos", evolution: "juridico", description: "Cálculos → Jurídico > Cálculos" },
  { ethos: "/caixa-de-entrada", evolution: "controladoria", description: "Caixa de entrada → Controladoria > Caixa de entrada" },
  { ethos: "/alertas", evolution: "controladoria", description: "Alertas → Controladoria > Alertas" },
  { ethos: "/atendimento", evolution: "atendimento", description: "Chat / WhatsApp → Atendimento > Conversas" },
  { ethos: "/clientes", evolution: "atendimento", description: "Clientes → Atendimento > Clientes" },
  { ethos: "/copiloto", evolution: "atendimento", description: "Copiloto → Atendimento > Copiloto" },
  { ethos: "/crm", evolution: "comercial", description: "CRM → Comercial > CRM / Leads" },
  { ethos: "/portal", evolution: "comercial", description: "Portal do cliente → Comercial > Portal" },
  { ethos: "/financeiro", evolution: "financeiro", description: "Financeiro → Financeiro > Lançamentos" },
  { ethos: "/indicadores", evolution: "administracao", description: "Indicadores → Administração > Indicadores" },
  { ethos: "/equipe", evolution: "administracao", description: "Equipe → Administração > Equipe" },
  { ethos: "/integracoes", evolution: "administracao", description: "Integrações → Administração > Integrações" },
  { ethos: "/automacoes", evolution: "administracao", description: "Automações → Administração > Automações" },
  { ethos: "/configuracoes", evolution: "administracao", description: "Configurações → Administração > Configurações" },
  { ethos: "/relatorios", evolution: "administracao", description: "Relatórios → Administração > Indicadores" },
  { ethos: "/gestao", evolution: "mesa", description: "Gestão → Minha Mesa (Kanban)" },
  { ethos: "/ia", evolution: "juridico", description: "IA → Jurídico (assistente contextual)" },
  { ethos: "/rute", evolution: "administracao", description: "RUTE → Administração (configuração da IA)" },
];
