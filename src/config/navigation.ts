import {
  CircleHelp,
  FolderOpen,
  BarChart3,
  Bell,
  Bot,
  Briefcase,
  CalendarClock,
  Calculator,
  CheckSquare,
  FileText,
  Hourglass,
  LayoutDashboard,
  MessageCircle,
  type LucideIcon,
  Plug,
  Scale,
  Settings,
  Users,
  UserSquare2,
  Wallet,
  FlaskConical,
  Globe,
  Zap,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions/catalog";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permissão exigida para ver o item. Sem permissão => oculto. */
  permission?: PermissionKey;
  /** Uma destas permissões basta para ver a seção. */
  permissionAny?: PermissionKey[];
  /** Fase do roadmap em que o módulo é entregue. Módulos não implementados abrem uma página de status honesta. */
  phase: number;
  implemented: boolean;
  summary: string;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "workspace", label: "Área de Trabalho", href: "/area-de-trabalho", icon: FolderOpen, permission: "clients:read", phase: 2, implemented: true, summary: "Pastas por cliente com casos, processos, atividades, conversas, documentos e financeiro conectados." },
  { key: "overview", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, phase: 1, implemented: true, summary: "Indicadores e atividade do escritório." },
  { key: "indicators", label: "Indicadores", href: "/indicadores", icon: BarChart3, phase: 9, implemented: true, summary: "Atrasados por tipo, movimentação de processos, evolução da carteira, processos por cliente e os seus números." },
  { key: "alerts", label: "Central de alertas", href: "/alertas", icon: Bell, phase: 9, implemented: true, summary: "Processos parados, tarefas, prazos, agenda, financeiro e integrações, com link direto para agir." },
  { key: "cases", label: "Processos e casos", href: "/processos", icon: Scale, permission: "cases:read", phase: 2, implemented: true, summary: "Cadastro de processos, partes, linha do tempo e carteira." },
  { key: "clients", label: "Clientes", href: "/clientes", icon: Users, permission: "clients:read", phase: 2, implemented: true, summary: "Cadastro de pessoas físicas e jurídicas com perfil completo." },
  { key: "whatsapp", label: "Conversas", href: "/atendimento", icon: MessageCircle, permission: "whatsapp:read", phase: 11, implemented: true, summary: "Caixa de conversas do WhatsApp (API oficial da Meta ou QR-Code) ligada aos clientes: responder, atribuir, notas internas, respostas rápidas e modelos." },
  { key: "chat-settings", label: "Configurar o Chat", href: "/atendimento/configuracoes", icon: Settings, permission: "whatsapp:manage", phase: 11, implemented: true, summary: "Número do WhatsApp, ausência e expediente, respostas rápidas e modelos." },
  { key: "crm", label: "CRM comercial", href: "/crm", icon: Briefcase, permission: "crm:read", phase: 6, implemented: true, summary: "Funil de leads, propostas e conversão em cliente." },
  { key: "tasks", label: "Tarefas", href: "/tarefas", icon: CheckSquare, permission: "tasks:read", phase: 3, implemented: true, summary: "Tarefas com Kanban, comentários e vínculo a processos (automações na Fase 6)." },
  { key: "calendar", label: "Agenda", href: "/agenda", icon: CalendarClock, permission: "deadlines:read", phase: 3, implemented: true, summary: "Calendário mensal com compromissos e prazos." },
  { key: "calculations", label: "Cálculos", href: "/calculos", icon: Calculator, permission: "cases:read", phase: 12, implemented: true, summary: "Atrasados da Justiça Federal, débitos do TJSP, verbas trabalhistas, rescisão e prazos, com planilha pronta e cálculo salvo no processo." },
  { key: "deadlines", label: "Prazos", href: "/prazos", icon: Hourglass, permission: "deadlines:read", phase: 3, implemented: true, summary: "Prazos cadastrados manualmente, com calculadora auxiliar e validação humana." },
  { key: "documents", label: "Documentos", href: "/documentos", icon: FileText, permission: "documents:read", phase: 5, implemented: true, summary: "Repositório privado com versões e modelos com campos de mesclagem (OCR na Fase 8)." },
  { key: "workflows", label: "Automações", href: "/automacoes", icon: Zap, permission: "workflows:manage", phase: 6, implemented: true, summary: "Regras que criam tarefas automaticamente a partir de eventos." },
  { key: "finance", label: "Financeiro", href: "/financeiro", icon: Wallet, permission: "finance:read", phase: 7, implemented: true, summary: "Contas a pagar e receber, baixas e estornos, parcelas e fluxo de caixa." },
  { key: "team", label: "Equipe e produtividade", href: "/equipe", icon: UserSquare2, permission: "productivity:read", phase: 3, implemented: true, summary: "Carga de trabalho por responsável e registro de horas." },
  { key: "reports", label: "Relatórios e BI", href: "/relatorios", icon: BarChart3, permission: "reports:read", phase: 9, implemented: true, summary: "Prazos, intimações, processos, equipe e financeiro por período, com exportação em planilha (CSV) auditada." },
  { key: "portal", label: "Portal do cliente", href: "/portal", icon: Globe, permission: "portal:access", phase: 6, implemented: true, summary: "Área do cliente com processos e documentos compartilhados (cobranças na Fase 7)." },
  { key: "copilot", label: "Copiloto de atendimento", href: "/copiloto", icon: Bot, permission: "ai:use", phase: 12, implemented: true, summary: "Transcrição do atendimento vira resumo, ações cabíveis, tarefas e documentos, sempre revisados por uma pessoa." },
  { key: "portal-team", label: "Mensagens do portal", href: "/portal-equipe", icon: MessageCircle, permission: "clients:read", phase: 12, implemented: true, summary: "Mensagens dos clientes pelo portal e pendências em aberto." },
  { key: "management", label: "Gestão", href: "/gestao", icon: LayoutDashboard, permission: "tasks:read", phase: 3, implemented: true, summary: "Quadros Kanban do escritório e pacotes de tarefas (contrato novo, encerramentos)." },
  { key: "ai", label: "Inteligência artificial", href: "/ia", icon: Bot, permission: "ai:use", phase: 8, implemented: true, summary: "Perguntas sobre o processo com fontes citadas, opt-in por escritório e limite mensal de consumo." },
  { key: "integrations", label: "Integrações", href: "/integracoes", icon: Plug, permission: "integrations:manage", phase: 8, implemented: true, summary: "API, Google e integrações compartilhadas." },
  { key: "prototypes", label: "Protótipos", href: "/prototipos", icon: FlaskConical, phase: 0, implemented: true, summary: "Telas só visuais das próximas versões (visível só com LEGALOS_PROTOTYPES=1)." },
  { key: "help", label: "Ajuda", href: "/ajuda", icon: CircleHelp, phase: 1, implemented: true, summary: "Primeiros passos, guias de uso e caminhos da plataforma." },
  { key: "settings", label: "Configurações", href: "/configuracoes", icon: Settings, phase: 1, implemented: true, summary: "Escritório, equipe, perfis e auditoria." },
];

export function getNavItem(key: string) {
  return NAV_ITEMS.find((n) => n.key === key);
}
