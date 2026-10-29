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
  Activity,
  Inbox,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  type LucideIcon,
  PenLine,
  Plug,
  Scale,
  Settings,
  Users,
  UserSquare2,
  Wallet,
  FlaskConical,
  Globe,
  Zap,
  Radar,
  HeartPulse,
  SlidersHorizontal,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { BOX_AVAILABLE } from "@/lib/box-retirement";

/** Os três "lugares" do LegalOS. Func = gestão do escritório (estilo Astrea/Advbox); Box = caixa de intimações, capturas e peticionamento (estilo LegalMail); Chat = atendimento por WhatsApp (estilo ChatGuru). */
export type Space = "func" | "box" | "chat";

export const SPACES: Record<Space, { name: string; short: string; home: string; summary: string }> = {
  func: { name: "LegalOS Func", short: "Func", home: "/dashboard", summary: "Gestão do escritório: processos, clientes, prazos, tarefas, agenda, documentos, financeiro e relatórios." },
  box: { name: "LegalOS Box", short: "Box", home: "/box", summary: "Caixa de intimações, capturas dos tribunais, peticionamento e certificados." },
  chat: { name: "LegalOS Chat", short: "Chat", home: "/atendimento", summary: "Atendimento por WhatsApp: conversas, equipe, respostas rápidas e ligação com os clientes." },
};

/** Caminhos que pertencem ao Box e ao Chat; todo o resto pertence ao Func. */
const BOX_PREFIXES = ["/box", "/caixa-de-entrada", "/peticoes", "/certificados", "/monitoramento", "/integracoes/pje"];
const CHAT_PREFIXES = ["/atendimento"];
const under = (pathname: string, prefixes: string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function spaceOfPath(pathname: string): Space {
  if (under(pathname, BOX_PREFIXES)) return "box";
  if (under(pathname, CHAT_PREFIXES)) return "chat";
  return "func";
}

export type NavItem = {
  key: string;
  /** Em qual espaço o item aparece na lateral. "both" = nos dois (ex.: Configurações). */
  space: Space | "both";
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permissão exigida para ver o item. Sem permissão => oculto. */
  permission?: PermissionKey;
  /** Fase do roadmap em que o módulo é entregue. Módulos não implementados abrem uma página de status honesta. */
  phase: number;
  implemented: boolean;
  summary: string;
  /** Box 2.0: "v2" só aparece com LEGALOS_BOX_V2=1; "legacy" só aparece sem a chave. Sem valor = aparece sempre. */
  box?: "v2" | "legacy";
};

export const NAV_ITEMS: NavItem[] = [
  { key: "workspace", space: "both", label: "Área de Trabalho", href: "/area-de-trabalho", icon: FolderOpen, permission: "clients:read", phase: 2, implemented: true, summary: "Pastas por cliente com casos, processos, atividades, conversas, documentos e financeiro conectados." },
  { key: "overview", space: "func", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, phase: 1, implemented: true, summary: "Indicadores e atividade do escritório." },
  { key: "indicators", space: "func", label: "Indicadores", href: "/indicadores", icon: BarChart3, phase: 9, implemented: true, summary: "Atrasados por tipo, movimentação de processos, evolução da carteira, processos por cliente e os seus números." },
  { key: "alerts", space: "func", label: "Central de alertas", href: "/alertas", icon: Bell, phase: 9, implemented: true, summary: "Publicações, andamentos, processos parados, tarefas, prazos, agenda, financeiro e integrações, com link direto para agir." },
  { key: "box-overview", space: "box", label: "Visão geral do Box", href: "/box", icon: LayoutDashboard, permission: "inbox:read", phase: 4, implemented: true, summary: "Painel do Box: intimações, capturas, certificados e petições." },
  { key: "inbox", space: "box", label: "Caixa de entrada", href: "/caixa-de-entrada", icon: Inbox, permission: "inbox:read", phase: 4, implemented: true, summary: "Central de intimações: registro manual ou por texto colado, duplicidade, distribuição e criação de tarefas e prazos (importação de tribunais na Fase 8)." },
  { key: "cases", space: "func", label: "Processos e casos", href: "/processos", icon: Scale, permission: "cases:read", phase: 2, implemented: true, summary: "Cadastro de processos, partes, linha do tempo e carteira." },
  { key: "clients", space: "func", label: "Clientes", href: "/clientes", icon: Users, permission: "clients:read", phase: 2, implemented: true, summary: "Cadastro de pessoas físicas e jurídicas com perfil completo." },
  { key: "whatsapp", space: "chat", label: "Conversas", href: "/atendimento", icon: MessageCircle, permission: "whatsapp:read", phase: 11, implemented: true, summary: "Caixa de conversas do WhatsApp (API oficial da Meta ou QR-Code) ligada aos clientes: responder, atribuir, notas internas, respostas rápidas e modelos." },
  { key: "chat-settings", space: "chat", label: "Configurar o Chat", href: "/atendimento/configuracoes", icon: Settings, permission: "whatsapp:manage", phase: 11, implemented: true, summary: "Número do WhatsApp, ausência e expediente, respostas rápidas e modelos." },
  { key: "crm", space: "func", label: "CRM comercial", href: "/crm", icon: Briefcase, permission: "crm:read", phase: 6, implemented: true, summary: "Funil de leads, propostas e conversão em cliente." },
  { key: "tasks", space: "func", label: "Tarefas", href: "/tarefas", icon: CheckSquare, permission: "tasks:read", phase: 3, implemented: true, summary: "Tarefas com Kanban, comentários e vínculo a processos (automações na Fase 6)." },
  { key: "calendar", space: "func", label: "Agenda", href: "/agenda", icon: CalendarClock, permission: "deadlines:read", phase: 3, implemented: true, summary: "Calendário mensal com compromissos e prazos." },
  { key: "calculations", space: "func", label: "Cálculos", href: "/calculos", icon: Calculator, permission: "cases:read", phase: 12, implemented: true, summary: "Atrasados da Justiça Federal, débitos do TJSP, verbas trabalhistas, rescisão e prazos, com planilha pronta e cálculo salvo no processo." },
  { key: "deadlines", space: "func", label: "Prazos", href: "/prazos", icon: Hourglass, permission: "deadlines:read", phase: 3, implemented: true, summary: "Prazos cadastrados manualmente, com calculadora auxiliar e validação humana." },
  { key: "documents", space: "func", label: "Documentos", href: "/documentos", icon: FileText, permission: "documents:read", phase: 5, implemented: true, summary: "Repositório privado com versões e modelos com campos de mesclagem (OCR na Fase 8)." },
  { key: "box-processes", space: "box", label: "Processos", href: "/box/processos", icon: Scale, permission: "inbox:read", phase: 4, implemented: true, summary: "Processos que já apareceram em comunicações do Box, com a situação dos autos e o que ainda precisa de confirmação.", box: "v2" },
  { key: "petitions", space: "box", label: "Peticionamento", href: "/peticoes", icon: PenLine, permission: "petitions:read", phase: 5, implemented: true, summary: "Preparação, revisão e aprovação; envio apenas por adaptador de demonstração (tribunais reais na Fase 8)." },
  { key: "box-connections", space: "box", label: "Conexões Judiciais", href: "/box/conexoes", icon: Radar, permission: "inbox:read", phase: 4, implemented: true, summary: "De onde o LegalOS recebe suas comunicações, o que está funcionando de verdade e o que falta para cada tribunal.", box: "v2" },
  { key: "box-health", space: "box", label: "Operação e Saúde", href: "/box/saude", icon: HeartPulse, permission: "inbox:read", phase: 4, implemented: true, summary: "Fontes, execuções, alertas, rotinas e certificados: o que está parado ou falhando, com ação sugerida.", box: "v2" },
  { key: "box-settings", space: "box", label: "Configurações do Box", href: "/box/configuracoes", icon: SlidersHorizontal, permission: "integrations:manage", phase: 4, implemented: true, summary: "Advogados e OABs monitorados, avisos e preferências do Box.", box: "v2" },
  { key: "workflows", space: "func", label: "Automações", href: "/automacoes", icon: Zap, permission: "workflows:manage", phase: 6, implemented: true, summary: "Regras que criam tarefas automaticamente a partir de eventos." },
  { key: "finance", space: "func", label: "Financeiro", href: "/financeiro", icon: Wallet, permission: "finance:read", phase: 7, implemented: true, summary: "Contas a pagar e receber, baixas e estornos, parcelas e fluxo de caixa." },
  { key: "team", space: "func", label: "Equipe e produtividade", href: "/equipe", icon: UserSquare2, permission: "productivity:read", phase: 3, implemented: true, summary: "Carga de trabalho por responsável e registro de horas." },
  { key: "reports", space: "func", label: "Relatórios e BI", href: "/relatorios", icon: BarChart3, permission: "reports:read", phase: 9, implemented: true, summary: "Prazos, intimações, processos, equipe e financeiro por período, com exportação em planilha (CSV) auditada." },
  { key: "portal", space: "func", label: "Portal do cliente", href: "/portal", icon: Globe, permission: "portal:access", phase: 6, implemented: true, summary: "Área do cliente com processos e documentos compartilhados (cobranças na Fase 7)." },
  { key: "copilot", space: "func", label: "Copiloto de atendimento", href: "/copiloto", icon: Bot, permission: "ai:use", phase: 12, implemented: true, summary: "Transcrição do atendimento vira resumo, ações cabíveis, tarefas e documentos, sempre revisados por uma pessoa." },
  { key: "rute", space: "func", label: "RUTE (IA)", href: "/rute", icon: Bot, permission: "ai:use", phase: 13, implemented: true, summary: "A IA do LegalOS: conecte Claude, ChatGPT ou Gemini, converse com o assistente e aprove as propostas da IA." },
  { key: "portal-team", space: "func", label: "Mensagens do portal", href: "/portal-equipe", icon: MessageCircle, permission: "clients:read", phase: 12, implemented: true, summary: "Mensagens dos clientes pelo portal e pendências em aberto." },
  { key: "management", space: "func", label: "Gestão", href: "/gestao", icon: LayoutDashboard, permission: "tasks:read", phase: 3, implemented: true, summary: "Quadros Kanban do escritório e pacotes de tarefas (contrato novo, encerramentos)." },
  { key: "ai", space: "func", label: "Inteligência artificial", href: "/ia", icon: Bot, permission: "ai:use", phase: 8, implemented: true, summary: "Perguntas sobre o processo com fontes citadas, opt-in por escritório e limite mensal de consumo." },
  { key: "certificates", space: "box", label: "Certificados digitais", href: "/certificados", icon: KeyRound, permission: "certificates:manage", phase: 10, implemented: true, summary: "Cofre de certificados A1 cifrados, com registro de uso e alerta de vencimento (base do motor de tribunais).", box: "legacy" },
  { key: "pje-connect", space: "box", label: "Conectar PJe", href: "/integracoes/pje", icon: KeyRound, permission: "cases:read", phase: 14, implemented: true, summary: "Informe o seu login do PJe uma vez: o LegalOS entra, confere o acesso e mostra o resultado.", box: "legacy" },
  { key: "integrations", space: "func", label: "Integrações", href: "/integracoes", icon: Plug, permission: "integrations:manage", phase: 8, implemented: true, summary: "API, Google e integrações compartilhadas." },
  { key: "monitoring", space: "box", label: "Monitoramento", href: "/monitoramento", icon: Activity, permission: "integrations:manage", phase: 10, implemented: true, summary: "Saúde da captura de intimações (DJEN e PJe/MNI): última execução, erros e fontes paradas.", box: "legacy" },
  { key: "prototypes", space: "both", label: "Protótipos", href: "/prototipos", icon: FlaskConical, phase: 0, implemented: true, summary: "Telas só visuais das próximas versões (visível só com LEGALOS_PROTOTYPES=1)." },
  { key: "help", space: "both", label: "Ajuda", href: "/ajuda", icon: CircleHelp, phase: 1, implemented: true, summary: "Primeiros passos, guias de uso e caminhos da plataforma." },
  { key: "settings", space: "both", label: "Configurações", href: "/configuracoes", icon: Settings, phase: 1, implemented: true, summary: "Escritório, equipe, perfis e auditoria." },
];

/** O item vale para a versão do Box em uso? (item sem marca vale sempre). */
export const navItemInBoxVersion = (n: Pick<NavItem, "box"> & { space?: string }, boxV2: boolean) => (BOX_AVAILABLE || (n.space !== "box" && !n.box)) && (!n.box || (n.box === "v2") === boxV2);

export function getNavItem(key: string) {
  return NAV_ITEMS.find((n) => n.key === key);
}
