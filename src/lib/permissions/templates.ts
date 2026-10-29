import type { PermissionKey } from "./catalog";

/** Modelos de perfil com o MÍNIMO de acesso para cada função. Criam um perfil personalizado que pode ser ajustado depois. */
export type RoleTemplate = { key: string; name: string; description: string; permissions: PermissionKey[] };

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { key: "somente_leitura", name: "Somente leitura", description: "Vê clientes, processos, tarefas, documentos e prazos. Não altera nada.", permissions: ["members:read", "clients:read", "cases:read", "tasks:read", "documents:read", "deadlines:read"] },
  { key: "atendimento", name: "Atendimento (WhatsApp)", description: "Só o Chat e a consulta básica de clientes. Sem processos, sem financeiro.", permissions: ["members:read", "clients:read", "whatsapp:read", "whatsapp:write"] },
  { key: "financeiro_consulta", name: "Financeiro (só consulta)", description: "Vê o financeiro e os relatórios; não lança nem dá baixa.", permissions: ["members:read", "clients:read", "finance:read", "reports:read"] },
  { key: "estagio_supervisionado", name: "Estagiário supervisionado", description: "Vê processos e documentos e cuida de tarefas. Não altera processos nem prazos.", permissions: ["members:read", "clients:read", "cases:read", "tasks:read", "tasks:write", "documents:read", "deadlines:read"] },
  { key: "prazos_e_intimacoes", name: "Prazos e intimações", description: "Trata intimações, prazos e tarefas. Sem documentos e sem financeiro.", permissions: ["members:read", "cases:read", "inbox:read", "inbox:write", "deadlines:read", "deadlines:write", "tasks:read", "tasks:write"] },
];

/** Permissões que merecem revisão periódica: quem as tem pode ver segredo, mexer em dinheiro, acessos ou integrações. */
export const SENSITIVE_PERMISSIONS: PermissionKey[] = ["vault:read", "vault:manage", "finance:manage", "members:manage", "roles:manage", "integrations:manage", "certificates:manage", "certificates:sign", "audit:read", "whatsapp:manage", "billing:manage", "clients:delete", "cases:delete"];
