/**
 * Dados de DEMONSTRAÇÃO — somente para desenvolvimento local, executados explicitamente (npm run db:seed).
 * Todos os nomes são fictícios. Recusa rodar em produção. Idempotente.
 */
import "../scripts/load-env";
import { db } from "../src/lib/db/client";
import { registerUser, login } from "../src/server/services/auth.service";
import { createOrganization } from "../src/server/services/organization.service";
import { resolveTenantContext } from "../src/server/services/tenant.service";
import { createInvitation, acceptInvitation } from "../src/server/services/invitation.service";
import { createClient } from "../src/server/services/client.service";
import { createCase } from "../src/server/services/case.service";
import { computeCnjCheck } from "../src/lib/validation/br-documents";

if (process.env.NODE_ENV === "production") {
  console.error("Recusado: o seed de demonstração não roda em produção.");
  process.exit(1);
}

const meta = { ipAddress: "127.0.0.1", userAgent: "seed", correlationId: "seed" };
const PASSWORD = "DemoSenha123";

async function ensureUser(name: string, email: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  await registerUser({ name, email, password: PASSWORD }, meta);
  return db.user.findUniqueOrThrow({ where: { email } });
}

const emptyClient = {
  document: "", tradeName: "", email: "", phone: "", birthDate: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "",
  addressDistrict: "", addressCity: "", addressState: "",
};
const emptyCase = {
  status: "ACTIVE" as const, legacyNumber: "", area: "Cível", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", phase: "", distributedAt: "", confidential: false,
  notes: "", responsibleId: "", clientRole: "PLAINTIFF" as const,
};

/** Clientes e processos FICTÍCIOS (CPF/CNPJ/CNJ apenas formalmente válidos, sem relação com pessoas reais). Idempotente. */
async function seedLegalData(ctx: NonNullable<Awaited<ReturnType<typeof resolveTenantContext>>>) {
  const orgId = ctx.organizationId;
  const clientOnce = async (input: Parameters<typeof createClient>[1]) => {
    const found = await db.client.findFirst({ where: { organizationId: orgId, name: input.name, deletedAt: null } });
    return found ?? createClient(ctx, input);
  };
  const caseOnce = async (input: Parameters<typeof createCase>[1]) => {
    const found = await db.case.findFirst({ where: { organizationId: orgId, number: input.number ? input.number : undefined, title: input.title, deletedAt: null } });
    return found ?? createCase(ctx, input);
  };
  const maria = await clientOnce({ ...emptyClient, type: "PERSON", status: "ACTIVE", name: "Maria Exemplo da Silva", document: "529.982.247-25", tags: "demonstração, consumidor" });
  const empresa = await clientOnce({ ...emptyClient, type: "COMPANY", status: "ACTIVE", name: "Comércio Exemplo Ltda.", tradeName: "Loja Exemplo", document: "11.222.333/0001-81", tags: "demonstração, empresarial" });
  await clientOnce({ ...emptyClient, type: "PERSON", status: "PROSPECT", name: "João Prospecto Fictício", tags: "demonstração" });
  const number = (seq: string) => `${seq}-${computeCnjCheck({ sequence: seq, year: "2025", segment: "8", court: "26", origin: "0100" })}.2025.8.26.0100`;
  await caseOnce({ ...emptyCase, number: number("0000101"), title: "Maria x Banco Exemplo — revisional (fictício)", court: "TJSP", courtState: "SP", clientId: maria.id });
  await caseOnce({ ...emptyCase, number: number("0000102"), title: "Comércio Exemplo — cobrança (fictício)", area: "Empresarial", clientId: empresa.id, clientRole: "PLAINTIFF" });
}

async function main() {
  const owner = await ensureUser("Helena Demonstração", "demo@legalos.local");
  let org = await db.organization.findFirst({ where: { createdById: owner.id, name: "Escritório Demonstração (dados fictícios)" } });
  if (!org) org = await createOrganization(owner.id, { name: "Escritório Demonstração (dados fictícios)", timezone: "America/Sao_Paulo" }, meta);
  const ctx = await resolveTenantContext(owner.id, org.id, meta);
  if (!ctx) throw new Error("Contexto não resolvido.");

  const people: [string, string, string][] = [
    ["Rafael Advogado Exemplo", "advogado@legalos.local", "LAWYER"],
    ["Marina Controladoria Exemplo", "controladoria@legalos.local", "CONTROLLER"],
    ["Paulo Financeiro Exemplo", "financeiro@legalos.local", "FINANCE"],
    ["Bia Estagiária Exemplo", "estagio@legalos.local", "ASSISTANT"],
  ];
  for (const [name, email, roleKey] of people) {
    const user = await ensureUser(name, email);
    const already = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: user.id } } });
    if (already) continue;
    const role = await db.role.findFirstOrThrow({ where: { organizationId: org.id, key: roleKey } });
    const { link } = await createInvitation(ctx, { email, roleId: role.id });
    await acceptInvitation(user.id, new URL(link).searchParams.get("token") as string, meta);
  }
  await seedLegalData(ctx);
  await login({ email: "demo@legalos.local", password: PASSWORD }, meta); // gera um evento de auditoria extra
  console.log("Seed concluído.\n  Login: demo@legalos.local\n  Senha: " + PASSWORD + "\n  (dados fictícios; apenas desenvolvimento)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
