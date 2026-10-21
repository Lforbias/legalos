import "./load-env";
import { db } from "../src/lib/db/client";
import { seedAstreaTeam, type TeamRoleKey } from "../src/server/import/astrea-team";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const USO = `Uso: tsx scripts/seed-team-astrea.ts --dir <pasta do backup> --owner <e-mail de quem é dono do escritório> --org-name "Nome do escritório"
       [--org <id>] [--owners e1,e2] [--roles email=ADMIN,email2=LAWYER] [--apply]
Sem --apply só simula. Papéis: OWNER, ADMIN, LAWYER, CONTROLLER, FINANCE, ASSISTANT.`;

async function main() {
  const dir = arg("dir");
  const owner = arg("owner")?.trim().toLowerCase();
  if (!dir || !owner) {
    console.log(USO);
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email: owner }, select: { id: true } });
  if (!user) throw new Error("Nenhum usuário com o e-mail de --owner.");
  const ms = await db.membership.findMany({ where: { userId: user.id, status: "ACTIVE", organization: { deletedAt: null } }, select: { organizationId: true, organization: { select: { name: true } } } });
  const wantedId = arg("org");
  const wantedName = arg("org-name")?.trim().toLowerCase();
  const cands = ms.filter((m) => (wantedId ? m.organizationId === wantedId : wantedName ? m.organization.name.trim().toLowerCase() === wantedName : false));
  if (cands.length !== 1) {
    console.error(cands.length ? "Mais de um escritório com esse nome; use --org <id>." : "Escritório não encontrado entre os do --owner. Os dele são:");
    for (const m of ms) console.error(`  ${m.organizationId}  ${m.organization.name}`);
    process.exit(1);
  }
  const target = cands[0]!;
  const overrides: Record<string, TeamRoleKey> = {};
  for (const pair of (arg("roles") ?? "").split(",").filter(Boolean)) {
    const [e, k] = pair.split("=");
    if (!e || !k) throw new Error(`--roles inválido: ${pair}`);
    overrides[e.trim().toLowerCase()] = k.trim().toUpperCase() as TeamRoleKey;
  }
  const owners = (arg("owners")?.split(",") ?? []).map((s) => s.trim()).filter(Boolean);
  const apply = process.argv.includes("--apply");
  console.log(`${apply ? "" : "[SIMULAÇÃO] "}Equipe do Astrea → "${target.organization.name}"`);
  const r = await seedAstreaTeam({ organizationId: target.organizationId, dir, ownerEmails: owners, overrides, dryRun: !apply });
  for (const m of r.equipe) console.log(`  ${m.roleKey.padEnd(9)} ${m.name}  <${m.email}>`);
  console.log(`\nContas novas (sem senha utilizável): ${r.contasCriadas} | contas que já existiam: ${r.contasExistentes}`);
  console.log(`Vínculos ${apply ? "criados" : "a criar"}: ${r.vinculosCriados} | já eram membros: ${r.jaEramMembros}`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
});
