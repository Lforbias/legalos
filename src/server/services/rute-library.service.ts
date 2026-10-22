import JSZip from "jszip";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/**
 * 6.0-F7 — biblioteca do escritório: instruções (como o escritório quer que a IA trabalhe) e modelos (peças-base), por área.
 * A IA lê pela ferramenta `biblioteca_do_escritorio` e pelo assistente; o pacote de "skill" leva o mesmo conteúdo para o Claude.
 */
export const KINDS = { INSTRUCAO: "Instrução", MODELO: "Modelo" } as const;
export const AREAS = { GERAL: "Geral", PREVIDENCIARIO: "Previdenciário", TRABALHISTA: "Trabalhista", CIVEL: "Cível", CONSUMIDOR: "Consumidor", IMOBILIARIO: "Imobiliário", FAMILIA: "Família", TRIBUTARIO: "Tributário", PENAL: "Penal" } as const;
const MAX_ITEMS = 200;

const schema = z.object({
  id: z.uuid().optional(),
  area: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, "Área inválida."),
  kind: z.enum(["INSTRUCAO", "MODELO"]),
  title: z.string().trim().min(3, "Título muito curto.").max(120),
  body: z.string().trim().min(10, "Escreva ao menos uma frase.").max(20_000),
  active: z.boolean().default(true),
});
export type InstructionInput = z.input<typeof schema>;

export async function listInstructions(ctx: TenantContext) {
  assertCan(ctx, "ai:use");
  const manage = can(ctx, "organization:manage");
  return db.officeInstruction.findMany({ where: { organizationId: ctx.organizationId, ...(manage ? {} : { active: true }) }, orderBy: [{ area: "asc" }, { kind: "asc" }, { title: "asc" }], take: MAX_ITEMS, select: { id: true, area: true, kind: true, title: true, body: true, active: true, updatedAt: true } });
}

export async function saveInstruction(ctx: TenantContext, raw: InstructionInput) {
  assertCan(ctx, "organization:manage");
  const r = schema.safeParse(raw);
  if (!r.success) {
    const f: Record<string, string[]> = {};
    for (const i of r.error.issues) (f[String(i.path[0] ?? "form")] ??= []).push(i.message);
    throw new ValidationError("Confira os campos.", f);
  }
  const d = r.data;
  if (d.id) {
    const res = await db.officeInstruction.updateMany({ where: { id: d.id, organizationId: ctx.organizationId }, data: { area: d.area, kind: d.kind, title: d.title, body: d.body, active: d.active } });
    if (res.count !== 1) throw new NotFoundError("Item não encontrado.");
    await audit({ action: "rute.library.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "office_instruction", resourceId: d.id, meta: ctx.meta });
    return { id: d.id };
  }
  const n = await db.officeInstruction.count({ where: { organizationId: ctx.organizationId } });
  if (n >= MAX_ITEMS) throw new ConflictError(`A biblioteca está no limite de ${MAX_ITEMS} itens.`);
  const c = await db.officeInstruction.create({ data: { organizationId: ctx.organizationId, area: d.area, kind: d.kind, title: d.title, body: d.body, active: d.active, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "rute.library.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "office_instruction", resourceId: c.id, meta: ctx.meta });
  return c;
}

export async function deleteInstruction(ctx: TenantContext, id: string) {
  assertCan(ctx, "organization:manage");
  const res = await db.officeInstruction.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (res.count !== 1) throw new NotFoundError("Item não encontrado.");
  await audit({ action: "rute.library.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "office_instruction", resourceId: id, meta: ctx.meta });
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";

/**
 * Pacote de "skill" para o Claude (Claude.ai → Configurações → Skills → enviar .zip): SKILL.md com as instruções do escritório
 * e uma pasta `modelos/`. Só conteúdo ATIVO. Não contém dados de clientes nem chaves.
 */
export async function buildSkillPackage(ctx: TenantContext): Promise<{ buffer: Buffer; filename: string; items: number }> {
  assertCan(ctx, "organization:manage");
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } });
  const rows = await db.officeInstruction.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: [{ area: "asc" }, { title: "asc" }], take: MAX_ITEMS });
  const instr = rows.filter((r) => r.kind === "INSTRUCAO");
  const models = rows.filter((r) => r.kind === "MODELO");
  const byArea = new Map<string, typeof instr>();
  for (const r of instr) byArea.set(r.area, [...(byArea.get(r.area) ?? []), r]);
  const lines: string[] = [];
  lines.push("---", "name: legalos-escritorio", `description: Instruções e modelos do escritório ${org.name.replace(/[\r\n:]/g, " ")} para trabalhar com o LegalOS. Use ao redigir peças, analisar processos, prazos ou intimações do escritório.`, "---", "", `# Como trabalhar no escritório ${org.name}`, "");
  lines.push("Use o conector LegalOS (RUTE) para CONSULTAR processos, clientes, prazos, tarefas e intimações, e para PROPOR ações. Nada que você propõe vale sem a confirmação de uma pessoa no LegalOS. Nunca fale com clientes e nunca protocole. Não invente fatos, números de processo ou jurisprudência.", "");
  if (byArea.size === 0) lines.push("_Nenhuma instrução cadastrada ainda._", "");
  for (const [area, list] of [...byArea.entries()].sort(([a], [b]) => (a === "GERAL" ? -1 : b === "GERAL" ? 1 : a.localeCompare(b)))) {
    lines.push(`## ${AREAS[area as keyof typeof AREAS] ?? area}`, "");
    for (const r of list) lines.push(`### ${r.title}`, "", r.body, "");
  }
  if (models.length) {
    lines.push("## Modelos", "", "Modelos-base do escritório estão na pasta `modelos/`:", "");
    for (const m of models) lines.push(`- modelos/${slug(m.title)}.md — ${m.title} (${AREAS[m.area as keyof typeof AREAS] ?? m.area})`);
    lines.push("");
  }
  const zip = new JSZip();
  const root = zip.folder("legalos-escritorio");
  root?.file("SKILL.md", lines.join("\n"));
  const used = new Set<string>();
  for (const m of models) {
    let s = slug(m.title);
    while (used.has(s)) s += "-2";
    used.add(s);
    root?.file(`modelos/${s}.md`, `# ${m.title}\n\nÁrea: ${AREAS[m.area as keyof typeof AREAS] ?? m.area}\n\n${m.body}\n`);
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await audit({ action: "rute.library.export", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, metadata: { items: rows.length }, meta: ctx.meta });
  return { buffer, filename: "legalos-escritorio-skill.zip", items: rows.length };
}
