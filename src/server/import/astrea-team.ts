import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db/client";
import { parseCsv } from "@/lib/import/csv";
import { hashPassword } from "@/lib/security/password";
import { normalizeEmail } from "@/lib/validation/email";

export type TeamRoleKey = "OWNER" | "ADMIN" | "LAWYER" | "CONTROLLER" | "FINANCE" | "ASSISTANT";
export type TeamMember = { email: string; name: string; roleKey: TeamRoleKey };
export type TeamReport = {
  dryRun: boolean;
  equipe: TeamMember[];
  contasCriadas: number;
  contasExistentes: number;
  vinculosCriados: number;
  jaEramMembros: number;
};

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t.toLowerCase() === "null" ? "" : t;
};
const properCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** Regra de papéis para demonstração (editável depois em Configurações → Equipe). `overrides` vence tudo. */
export function guessRole(row: Record<string, string>, ownerEmails: Set<string>, overrides: Map<string, TeamRoleKey>): TeamRoleKey {
  const email = normalizeEmail(clean(row["Login"]));
  const forced = overrides.get(email);
  if (forced) return forced;
  if (ownerEmails.has(email)) return "OWNER";
  const admin = clean(row["Administrador"]) === "Sim";
  const fin = clean(row["Acesso financeiro"]) === "Sim";
  if (admin && fin) return "ADMIN";
  if (fin) return "FINANCE";
  const local = email.split("@")[0] ?? "";
  if (/^dra?\./.test(local) || local.includes("adv")) return "LAWYER";
  return "ASSISTANT";
}

/** Lê Usuário.csv (+ Contatos.csv para o nome completo) e monta a equipe ATIVA (Tipo "Usuário"; clientes com portal ficam de fora). */
export function readTeam(dir: string, ownerEmails: string[], overrides: Record<string, TeamRoleKey> = {}): TeamMember[] {
  const users = parseCsv(fs.readFileSync(path.join(dir, "Usuário.csv"), "utf8"));
  const contactsFile = path.join(dir, "Contatos.csv");
  const names = new Map<string, string>();
  if (fs.existsSync(contactsFile)) for (const c of parseCsv(fs.readFileSync(contactsFile, "utf8"))) names.set(clean(c["Código"]), clean(c["Nome"]));
  const owners = new Set(ownerEmails.map(normalizeEmail));
  const ov = new Map(Object.entries(overrides).map(([k, v]) => [normalizeEmail(k), v]));
  const out = new Map<string, TeamMember>();
  for (const r of users) {
    if (clean(r["Tipo"]) !== "Usuário" || clean(r["Status"]) !== "Ativo") continue;
    const email = normalizeEmail(clean(r["Login"]));
    if (!email.includes("@") || out.has(email)) continue;
    const full = names.get(clean(r["Contato"])) || "";
    const name = properCase(full || clean(r["Apelido"]) || email.split("@")[0]!).slice(0, 120);
    out.set(email, { email, name, roleKey: guessRole(r, owners, ov) });
  }
  return [...out.values()];
}

/**
 * Cadastra a equipe do Astrea em UM escritório: contas que já existem só ganham vínculo; as que não existem são criadas
 * SEM senha utilizável (senha aleatória que ninguém conhece, e-mail não verificado) — servem para os responsáveis aparecerem
 * e para o importador vincular os itens. Idempotente. Com dryRun=true não grava nada.
 */
export async function seedAstreaTeam(opts: { organizationId: string; dir: string; ownerEmails: string[]; overrides?: Record<string, TeamRoleKey>; dryRun: boolean }): Promise<TeamReport> {
  const equipe = readTeam(opts.dir, opts.ownerEmails, opts.overrides);
  const roles = await db.role.findMany({ where: { organizationId: opts.organizationId }, select: { id: true, key: true } });
  const roleId = new Map(roles.map((r) => [r.key, r.id]));
  const report: TeamReport = { dryRun: opts.dryRun, equipe, contasCriadas: 0, contasExistentes: 0, vinculosCriados: 0, jaEramMembros: 0 };

  for (const m of equipe) {
    const rid = roleId.get(m.roleKey);
    if (!rid) throw new Error(`Perfil ${m.roleKey} não existe neste escritório.`);
    let user = await db.user.findUnique({ where: { email: m.email }, select: { id: true } });
    if (user) report.contasExistentes++;
    else {
      report.contasCriadas++;
      if (!opts.dryRun) {
        const passwordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
        user = await db.user.create({ data: { email: m.email, name: m.name, passwordHash }, select: { id: true } });
      }
    }
    if (!user) continue; // simulação de conta nova
    const existing = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: opts.organizationId, userId: user.id } }, select: { id: true } });
    if (existing) {
      report.jaEramMembros++;
      continue;
    }
    report.vinculosCriados++;
    if (!opts.dryRun) await db.membership.create({ data: { organizationId: opts.organizationId, userId: user.id, roleId: rid } });
  }
  // simulação: contas novas ainda não existem, então seus vínculos também seriam novos
  if (opts.dryRun) report.vinculosCriados += report.contasCriadas;
  return report;
}
