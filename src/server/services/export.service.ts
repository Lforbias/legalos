import { db } from "@/lib/db/client";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { ValidationError } from "@/lib/permissions/check";
import type { CsvCell } from "@/lib/reports/csv";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { caseVisibility } from "./case.service";

/**
 * 2.0-F6: exportação geral das listas (clientes, processos, tarefas, lançamentos) para Excel ou CSV.
 * Cada exportação exige a permissão de leitura do módulo, respeita processos confidenciais e é registrada na auditoria
 * (sem o conteúdo). Limite de 5.000 linhas por arquivo; se passar, o arquivo avisa que foi cortado.
 */

export const EXPORT_KINDS = {
  clientes: { label: "Clientes", permission: "clients:read" },
  processos: { label: "Processos", permission: "cases:read" },
  tarefas: { label: "Tarefas", permission: "tasks:read" },
  lancamentos: { label: "Lançamentos financeiros", permission: "finance:read" },
} as const;
export type ExportKind = keyof typeof EXPORT_KINDS;
export const EXPORT_KIND_LIST = Object.keys(EXPORT_KINDS) as ExportKind[];
export const isExportKind = (v: string | null): v is ExportKind => !!v && v in EXPORT_KINDS;
export const availableExports = (ctx: TenantContext) => EXPORT_KIND_LIST.filter((k) => can(ctx, EXPORT_KINDS[k].permission));

const LIMIT = 5000;
const ymd = (d: Date | null | undefined) => (d ? formatYmd(dateToYmd(d)) : "");
const money = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));
const dt = (d: Date | null | undefined, tz: string) => (d ? new Intl.DateTimeFormat("pt-BR", { timeZone: tz, dateStyle: "short" }).format(d) : "");

export type ExportTable = { headers: string[]; rows: CsvCell[][]; truncated: boolean };

export async function exportList(ctx: TenantContext, kind: ExportKind): Promise<ExportTable> {
  const def = EXPORT_KINDS[kind];
  if (!def) throw new ValidationError("Exportação desconhecida.");
  assertCan(ctx, def.permission);
  const org = ctx.organizationId;
  let headers: string[] = [];
  let rows: CsvCell[][] = [];
  if (kind === "clientes") {
    const r = await db.client.findMany({ where: { organizationId: org, deletedAt: null }, orderBy: { name: "asc" }, take: LIMIT + 1 });
    headers = ["Nome", "Tipo", "Situação", "Documento", "E-mail", "Telefone", "Nascimento", "Cidade", "UF", "Etiquetas", "Cadastrado em"];
    rows = r.slice(0, LIMIT).map((c) => [c.name, c.type === "PERSON" ? "Pessoa física" : "Pessoa jurídica", c.status === "ACTIVE" ? "Ativo" : String(c.status), c.document, c.email, c.phone, ymd(c.birthDate), c.addressCity, c.addressState, c.tags.join(", "), dt(c.createdAt, ctx.timezone)]);
    return { headers, rows, truncated: r.length > LIMIT };
  }
  if (kind === "processos") {
    const r = await db.case.findMany({
      where: { AND: [{ organizationId: org, deletedAt: null }, caseVisibility(ctx)] },
      orderBy: { createdAt: "desc" },
      take: LIMIT + 1,
      select: { title: true, number: true, legacyNumber: true, area: true, court: true, courtUnit: true, courtState: true, subject: true, status: true, phase: true, claimValue: true, distributedAt: true, createdAt: true, parties: { where: { isOurClient: true }, select: { name: true }, take: 5 }, members: { where: { role: "RESPONSIBLE" }, select: { user: { select: { name: true } } }, take: 1 } },
    });
    headers = ["Título", "Número", "Cliente(s)", "Responsável", "Área", "Tribunal", "Unidade", "UF", "Assunto", "Situação", "Fase", "Valor da causa", "Distribuído em", "Cadastrado em"];
    rows = r.slice(0, LIMIT).map((c) => [c.title, c.number ?? c.legacyNumber, c.parties.map((p) => p.name).join("; "), c.members[0]?.user.name ?? "", c.area, c.court, c.courtUnit, c.courtState, c.subject, String(c.status), c.phase, money(c.claimValue), ymd(c.distributedAt), dt(c.createdAt, ctx.timezone)]);
    return { headers, rows, truncated: r.length > LIMIT };
  }
  if (kind === "tarefas") {
    const r = await db.task.findMany({
      where: { organizationId: org, deletedAt: null, OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: LIMIT + 1,
      select: { title: true, status: true, priority: true, dueDate: true, completedAt: true, createdAt: true, case: { select: { title: true } }, client: { select: { name: true } } },
    });
    headers = ["Tarefa", "Situação", "Prioridade", "Vencimento", "Concluída em", "Processo", "Cliente", "Criada em"];
    rows = r.slice(0, LIMIT).map((t) => [t.title, String(t.status), String(t.priority), ymd(t.dueDate), dt(t.completedAt, ctx.timezone), t.case?.title ?? "", t.client?.name ?? "", dt(t.createdAt, ctx.timezone)]);
    return { headers, rows, truncated: r.length > LIMIT };
  }
  const r = await db.financeEntry.findMany({
    where: { organizationId: org, canceledAt: null, OR: [{ caseId: null }, { caseId: { in: (await db.case.findMany({ where: { AND: [{ organizationId: org, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true } })).map((c) => c.id) } }] },
    orderBy: { dueDate: "desc" },
    take: LIMIT + 1,
  });
  const clientIds = [...new Set(r.map((e) => e.clientId).filter((x): x is string => !!x))];
  const clients = new Map((await db.client.findMany({ where: { id: { in: clientIds }, organizationId: org }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  headers = ["Descrição", "Tipo", "Natureza", "Situação", "Valor", "Pago", "Saldo", "Emissão", "Vencimento", "Cliente", "Parcela"];
  rows = r.slice(0, LIMIT).map((e) => [e.description, String(e.type), e.kind === "RECEIVABLE" ? "A receber" : "A pagar", String(e.status), money(e.amount), money(e.paidAmount), Math.round(((money(e.amount) ?? 0) - (money(e.paidAmount) ?? 0)) * 100) / 100, ymd(e.issueDate), ymd(e.dueDate), e.clientId ? (clients.get(e.clientId) ?? "") : e.counterparty ?? "", e.installmentNo ? `${e.installmentNo}/${e.installmentTotal ?? "?"}` : ""]);
  return { headers, rows, truncated: r.length > LIMIT };
}

export async function recordExport(ctx: TenantContext, kind: string, rows: number, format: string) {
  await audit({ action: "export.list", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "export", metadata: { kind, rows, format }, meta: ctx.meta });
}
