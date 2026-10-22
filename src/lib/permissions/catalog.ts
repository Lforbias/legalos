/**
 * Catálogo de permissões granulares. Formato: "<recurso>:<ação>".
 * As permissões dos módulos futuros já existem aqui para que perfis personalizados e a navegação
 * sejam consistentes; o código de cada módulo as aplica quando for implementado.
 */
export const PERMISSION_GROUPS = [
  {
    key: "organization",
    label: "Escritório",
    permissions: [
      { key: "organization:manage", label: "Editar dados e configurações do escritório" },
      { key: "billing:manage", label: "Gerenciar plano e cobrança" },
      { key: "audit:read", label: "Consultar trilha de auditoria" },
    ],
  },
  {
    key: "team",
    label: "Equipe e acessos",
    permissions: [
      { key: "members:read", label: "Ver membros da equipe" },
      { key: "members:invite", label: "Convidar usuários" },
      { key: "members:manage", label: "Alterar perfil, suspender e remover membros" },
      { key: "roles:manage", label: "Criar e editar perfis de acesso" },
      { key: "productivity:read", label: "Ver produtividade da equipe" },
    ],
  },
  {
    key: "clients",
    label: "Clientes e CRM",
    permissions: [
      { key: "clients:read", label: "Ver clientes" },
      { key: "clients:write", label: "Criar e editar clientes" },
      { key: "clients:delete", label: "Excluir clientes" },
      { key: "crm:read", label: "Ver CRM comercial" },
      { key: "crm:write", label: "Gerir leads e propostas" },
    ],
  },
  {
    key: "cases",
    label: "Processos, intimações e prazos",
    permissions: [
      { key: "cases:read", label: "Ver processos" },
      { key: "cases:write", label: "Criar e editar processos" },
      { key: "cases:delete", label: "Excluir processos" },
      { key: "inbox:read", label: "Ver caixa de intimações" },
      { key: "inbox:write", label: "Tratar e distribuir intimações" },
      { key: "deadlines:read", label: "Ver prazos e agenda" },
      { key: "deadlines:write", label: "Criar e editar prazos" },
      { key: "deadlines:validate", label: "Validar prazos como definitivos" },
    ],
  },
  {
    key: "work",
    label: "Tarefas, documentos e peticionamento",
    permissions: [
      { key: "tasks:read", label: "Ver tarefas" },
      { key: "tasks:write", label: "Criar e editar tarefas" },
      { key: "workflows:manage", label: "Configurar workflows" },
      { key: "documents:read", label: "Ver documentos" },
      { key: "documents:write", label: "Enviar e editar documentos" },
      { key: "templates:manage", label: "Criar e editar modelos de documentos" },
      { key: "petitions:read", label: "Ver petições" },
      { key: "petitions:write", label: "Preparar petições" },
      { key: "petitions:approve", label: "Aprovar petições para envio" },
    ],
  },
  {
    key: "finance",
    label: "Financeiro e relatórios",
    permissions: [
      { key: "finance:read", label: "Ver financeiro" },
      { key: "finance:write", label: "Lançar, editar e dar baixa em movimentações" },
      { key: "finance:manage", label: "Cadastros financeiros, cancelar lançamentos e estornar baixas" },
      { key: "reports:read", label: "Ver relatórios e BI" },
    ],
  },
  {
    key: "platform",
    label: "IA, integrações e portal",
    permissions: [
      { key: "ai:use", label: "Usar assistente de IA" },
      { key: "integrations:manage", label: "Gerenciar integrações" },
      { key: "certificates:manage", label: "Cofre de certificados digitais (enviar, revogar e ver usos)" },
      { key: "vault:manage", label: "Cofre de senhas de clientes: cadastrar, trocar e apagar" },
      { key: "vault:read", label: "Cofre de senhas de clientes: ver a senha (pede o código do 2FA e fica registrado)" },
      { key: "portal:access", label: "Acessar o portal do cliente (cliente externo)" },
    ],
  },
  {
    key: "whatsapp",
    label: "Atendimento por WhatsApp",
    permissions: [
      { key: "whatsapp:read", label: "Ver conversas do WhatsApp" },
      { key: "whatsapp:write", label: "Responder, atribuir e anotar conversas do WhatsApp" },
      { key: "whatsapp:manage", label: "Conectar o número, mensagem de ausência e respostas rápidas" },
    ],
  },
] as const;

export type PermissionKey = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_SET.has(value);
}

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label])),
);
