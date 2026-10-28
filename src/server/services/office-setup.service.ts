import "server-only";
import { db } from "@/lib/db/client";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { NotFoundError } from "@/lib/permissions/check";
import { assertCan, can, type TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";
import { documentVisibilityWhere } from "./document.service";
import { getRuteSettings } from "./rute-settings.service";

export type SetupStep = {
  id: string;
  stage: 1 | 2 | 3;
  title: string;
  description: string;
  href: string;
  status: "CONFIGURED" | "PENDING" | "REVIEW";
};

/** Estado calculado a cada acesso. Existência de cadastro não comprova homologação. */
export async function getOfficeSetup(ctx: TenantContext): Promise<SetupStep[]> {
  assertCan(ctx, "organization:manage");
  const organization = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { requireMfa: true } });
  if (!organization) throw new NotFoundError("Escritório não encontrado.");
  const org = { organizationId: ctx.organizationId };
  const steps: SetupStep[] = [{ id: "security", stage: 1, title: "Proteção da equipe", description: organization.requireMfa ? "A verificação em duas etapas é exigida para a equipe interna." : "Defina a política de verificação em duas etapas e confira os perfis antes de convidar a equipe.", href: "/configuracoes/seguranca", status: organization.requireMfa ? "CONFIGURED" : "PENDING" }];
  // A permissão de administrar o escritório não concede leitura dos módulos.
  const add = async (permission: PermissionKey, load: () => Promise<SetupStep>) => {
    if (can(ctx, permission)) steps.push(await load());
  };
  await add("cases:read", async () => {
    const count = await db.case.count({ where: { ...org, deletedAt: null, AND: [caseVisibility(ctx)] } });
    return { id: "cases", stage: 1, title: "Carteira processual", description: count ? `${count} processos visíveis. Confira responsáveis, partes e sigilo antes de iniciar a operação.` : "Cadastre um processo ou importe a carteira existente, conferindo partes, responsáveis e sigilo.", href: "/processos", status: count ? "CONFIGURED" : "PENDING" };
  });
  await add("deadlines:read", async () => {
    const count = await db.deadline.count({ where: { ...org, status: "DRAFT", case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } });
    return { id: "deadlines", stage: 1, title: "Conferência dos prazos", description: count ? `${count} prazos visíveis aguardam validação humana. Confira datas e responsáveis.` : "Confira a rotina de cadastro, revisão e cumprimento dos prazos com a controladoria.", href: "/prazos", status: count ? "PENDING" : "REVIEW" };
  });
  await add("integrations:manage", async () => {
    const [djen, mni] = await Promise.all([db.djenMonitor.count({ where: { ...org, enabled: true } }), db.courtConnection.count({ where: { ...org, enabled: true } })]);
    return { id: "notices", stage: 1, title: "Captura e monitoramento", description: `${djen} monitores DJEN e ${mni} conexões de tribunal habilitados. Confira a última execução e compare o resultado com a fonte oficial.`, href: "/integracoes/diagnostico", status: djen + mni ? "REVIEW" : "PENDING" };
  });
  await add("finance:manage", async () => {
    const count = await db.financeAccount.count({ where: { ...org, deletedAt: null, active: true } });
    return { id: "finance", stage: 2, title: "Financeiro jurídico", description: count ? `${count} contas ativas. Concilie saldos iniciais e parcelas antes de usar as previsões.` : "Cadastre as contas, categorias e saldos iniciais do escritório.", href: "/financeiro/cadastros", status: count ? "CONFIGURED" : "PENDING" };
  });
  await add("whatsapp:manage", async () => {
    const count = await db.whatsappAccount.count({ where: { ...org, enabled: true } });
    return { id: "chat", stage: 2, title: "WhatsApp e CRM", description: count ? `${count} números habilitados. Valide recebimento, envio e vínculo ao cliente ou lead com um contato de teste autorizado.` : "Configure um número, as filas de atendimento e os responsáveis pelo relacionamento.", href: "/atendimento/configuracoes", status: count ? "REVIEW" : "PENDING" };
  });
  await add("workflows:manage", async () => {
    const count = await db.workflowRule.count({ where: { ...org, deletedAt: null, active: true } });
    return { id: "workflows", stage: 2, title: "Automações entre módulos", description: count ? `${count} regras ativas. Confira as execuções recentes e responsáveis. Regras podem partir de processos, intimações, prazos, CRM, tarefas e documentos.` : "Defina as regras para criar tarefas a partir de eventos dos módulos. Ative somente as rotinas acordadas com a equipe.", href: "/automacoes", status: count ? "CONFIGURED" : "PENDING" };
  });
  await add("documents:read", async () => {
    const visibility = documentVisibilityWhere(ctx);
    const count = visibility ? await db.document.count({ where: visibility }) : 0;
    return { id: "documents", stage: 2, title: "Acervo de documentos", description: count ? `${count} documentos visíveis. Confira versões, categorias, modelos e acesso dos responsáveis.` : "Envie os primeiros documentos e organize os modelos do escritório.", href: "/documentos", status: count ? "CONFIGURED" : "PENDING" };
  });
  await add("ai:use", async () => {
    const settings = await getRuteSettings(ctx);
    const environmentKey = { ANTHROPIC: process.env.ANTHROPIC_API_KEY, GEMINI: process.env.GEMINI_API_KEY, OPENAI: process.env.OPENAI_API_KEY }[settings.provider];
    const configured = settings.assistantEnabled && !settings.emergencyStop && !!settings.consentAt && (settings.hasOfficeKey || !!environmentKey?.trim());
    return { id: "rute", stage: 2, title: "RUTE e governança", description: configured ? "Assistente habilitada com chave e consentimento. Valide o provedor, os limites e o fluxo de confirmação de propostas." : "Configure provedor, consentimento e limites de uso para habilitar a assistente quando o escritório decidir utilizá-la.", href: "/rute?aba=situacao", status: configured ? "REVIEW" : "PENDING" };
  });
  await add("clients:write", async () => {
    const count = await db.portalAccount.count({ where: { ...org, revokedAt: null } });
    return { id: "portal", stage: 3, title: "Portal do cliente", description: count ? `${count} acessos ativos. Confira com uma conta de cliente os processos e documentos efetivamente compartilhados.` : "Escolha um cliente piloto, compartilhe os registros autorizados e convide-o pelo cadastro do cliente.", href: "/clientes", status: count ? "REVIEW" : "PENDING" };
  });
  await add("integrations:manage", async () => {
    const count = await db.importMap.count({ where: org });
    return { id: "migration", stage: 3, title: "Migração e conferência", description: count ? `${count} vínculos de importação registrados. Compare quantidades e amostras com a origem, incluindo financeiro, prazos e anexos.` : "Prepare a exportação do sistema anterior. Faça uma simulação da importação e confira o relatório antes de gravar os dados.", href: "/integracoes/diagnostico", status: count ? "REVIEW" : "PENDING" };
  });
  await add("reports:read", async () => ({ id: "reports", stage: 3, title: "Indicadores e relatórios", description: "Confira os filtros, o período e a conciliação dos indicadores com os cadastros. Cada área exige a permissão do módulo correspondente.", href: "/relatorios", status: "REVIEW" }));
  steps.push({ id: "mobile", stage: 3, title: "Aplicativo no celular", description: "Instale o aplicativo pelo navegador no aparelho da equipe. Confira login, agenda e avisos. O acesso aos dados exige conexão.", href: "/ajuda#guia-app", status: "REVIEW" });
  steps.push({ id: "training", stage: 3, title: "Treinamento e suporte", description: "Apresente à equipe a rotina de triagem, validação de prazos, atendimento e suporte. Consulte os guias da central de ajuda.", href: "/ajuda", status: "REVIEW" });
  return steps;
}
