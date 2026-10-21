import { ALL_PERMISSIONS, type PermissionKey } from "./catalog";

export type SystemRoleKey = "OWNER" | "ADMIN" | "LAWYER" | "CONTROLLER" | "FINANCE" | "ASSISTANT" | "CLIENT";

export type SystemRoleDefinition = {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: PermissionKey[];
};

const READ_CORE: PermissionKey[] = ["members:read", "clients:read", "cases:read", "tasks:read", "documents:read", "deadlines:read"];

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: "OWNER",
    name: "Proprietário",
    description: "Controle total do escritório, incluindo plano e cobrança. Imutável.",
    permissions: [...ALL_PERMISSIONS],
  },
  {
    key: "ADMIN",
    name: "Administrador",
    description: "Administração operacional, exceto plano e cobrança.",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "billing:manage"),
  },
  {
    key: "LAWYER",
    name: "Advogado",
    description: "Casos, clientes, tarefas, documentos e providências jurídicas.",
    permissions: [
      ...READ_CORE,
      "clients:write",
      "crm:read",
      "crm:write",
      "cases:write",
      "inbox:read",
      "inbox:write",
      "deadlines:write",
      "deadlines:validate",
      "tasks:write",
      "documents:write",
      "templates:manage",
      "petitions:read",
      "petitions:write",
      "petitions:approve",
      "ai:use",
      "reports:read",
      "whatsapp:read",
      "whatsapp:write",
    ],
  },
  {
    key: "CONTROLLER",
    name: "Controladoria",
    description: "Intimações, prazos, distribuição de tarefas e acompanhamento processual.",
    permissions: [
      ...READ_CORE,
      "cases:write",
      "inbox:read",
      "inbox:write",
      "deadlines:write",
      "deadlines:validate",
      "tasks:write",
      "workflows:manage",
      "documents:write",
      "petitions:read",
      "petitions:write",
      "productivity:read",
      "reports:read",
      "ai:use",
      "whatsapp:read",
      "whatsapp:write",
    ],
  },
  {
    key: "FINANCE",
    name: "Financeiro",
    description: "Recursos financeiros autorizados.",
    permissions: ["members:read", "clients:read", "cases:read", "finance:read", "finance:write", "finance:manage", "reports:read"],
  },
  {
    key: "ASSISTANT",
    name: "Assistente / Estagiário",
    description: "Acesso limitado a casos, documentos e tarefas.",
    permissions: ["members:read", "clients:read", "cases:read", "tasks:read", "tasks:write", "documents:read", "documents:write", "deadlines:read", "petitions:read", "petitions:write", "whatsapp:read", "whatsapp:write"],
  },
  {
    key: "CLIENT",
    name: "Cliente externo",
    description: "Acesso exclusivo ao portal do cliente e aos recursos expressamente autorizados.",
    permissions: ["portal:access"],
  },
];

export const OWNER_ROLE_KEY: SystemRoleKey = "OWNER";
