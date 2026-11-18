/** Constantes do Cowork compartilhadas entre servidor e navegador (sem dependências de servidor). */

export const COWORK_DEPARTMENTS = ["juridico", "atendimento", "comercial", "financeiro", "administracao"] as const;
export type CoworkDepartment = (typeof COWORK_DEPARTMENTS)[number];

export const COWORK_DEPARTMENT_LABEL: Record<CoworkDepartment, string> = {
  juridico: "Jurídico",
  atendimento: "Atendimento",
  comercial: "Comercial",
  financeiro: "Financeiro",
  administracao: "Gestão",
};

export const COWORK_DEPARTMENT_COLOR: Record<CoworkDepartment, string> = {
  juridico: "#6366f1",
  atendimento: "#10b981",
  comercial: "#f59e0b",
  financeiro: "#8b5cf6",
  administracao: "#64748b",
};

export function isCoworkDepartment(v: unknown): v is CoworkDepartment {
  return typeof v === "string" && (COWORK_DEPARTMENTS as readonly string[]).includes(v);
}

export const RESOURCE_KINDS = ["CLIENT", "CASE", "DOCUMENT", "FOLDER", "TASK", "DEADLINE", "EVENT", "MEETING"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  CLIENT: "Cliente",
  CASE: "Processo",
  DOCUMENT: "Documento",
  FOLDER: "Pasta do cliente",
  TASK: "Tarefa",
  DEADLINE: "Prazo",
  EVENT: "Compromisso",
  MEETING: "Reunião",
};

export const WORK_PURPOSES = ["TASK", "ACTIVITY", "FORWARD", "APPOINTMENT", "REVIEW", "PENDING"] as const;
export type WorkPurpose = (typeof WORK_PURPOSES)[number];
export const WORK_PURPOSE_LABEL: Record<WorkPurpose, string> = {
  TASK: "Tarefa",
  ACTIVITY: "Atividade",
  FORWARD: "Encaminhamento",
  APPOINTMENT: "Compromisso na agenda",
  REVIEW: "Revisão",
  PENDING: "Pendência",
};

export const AVAILABILITY_LABEL = { AVAILABLE: "Disponível", BUSY: "Ocupado(a)", AWAY: "Ausente" } as const;

export const WORK_STATE_LABEL = {
  NOT_INFORMED: "Não informado",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando",
  DONE: "Concluído",
  IN_MEETING: "Em reunião",
} as const;
export type WorkState = keyof typeof WORK_STATE_LABEL;

export const MEETING_STATUS_LABEL = { SCHEDULED: "Agendada", IN_PROGRESS: "Em andamento", ENDED: "Encerrada", CANCELED: "Cancelada" } as const;
export const RSVP_LABEL = { PENDING: "Sem resposta", ACCEPTED: "Confirmada", DECLINED: "Recusada" } as const;
export const ATTENDANCE_LABEL = { UNKNOWN: "Não registrada", PRESENT: "Presente", ABSENT: "Ausente" } as const;

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGE_PAGE_SIZE = 50;
export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const ATTACHMENTS_PER_MESSAGE = 5;
/** Janela em que o autor pode editar a própria mensagem. */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Cor estável para o avatar de iniciais (não existe foto de perfil no LegalOS). */
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}
