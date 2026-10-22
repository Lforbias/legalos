import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db/client";
import { ENTITIES, runAstreaImport, type ImportEntity } from "../src/server/import/astrea-import";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const USO = `Uso: npm run import:astrea -- --dir <pasta do backup> --email <seu e-mail no LegalOS> [--org <id do escritório>] [--only clientes,processos,prazos,tarefas,agenda,intimacoes,andamentos,documentos,financeiro] [--dry-run] [--report relatorio.json]

  --dry-run   Simula: lê tudo, valida e mostra o relatório, sem gravar nada.
  Pode ser executado de novo com segurança: o que já foi importado é pulado.`;

async function main() {
  const dir = arg("dir");
  const email = arg("email")?.trim().toLowerCase();
  if (!dir || !email || flag("help")) {
    console.log(USO);
    process.exit(dir && email ? 0 : 1);
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Pasta não encontrada: ${dir}`);
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error("Nenhum usuário com este e-mail.");
  const memberships = await db.membership.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { organizationId: true, organization: { select: { name: true, timezone: true, deletedAt: true } } } });
  const orgs = memberships.filter((m) => !m.organization.deletedAt);
  const wanted = arg("org");
  const chosen = wanted ? orgs.find((m) => m.organizationId === wanted) : orgs.length === 1 ? orgs[0] : undefined;
  if (!chosen) {
    console.error(orgs.length ? `Este usuário participa de ${orgs.length} escritórios. Informe --org com um destes ids:` : "Este usuário não participa de nenhum escritório ativo.");
    for (const m of orgs) console.error(`  ${m.organizationId}  ${m.organization.name}`);
    process.exit(1);
  }
  const only = arg("only")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ImportEntity[] | undefined;
  if (only?.some((o) => !(ENTITIES as readonly string[]).includes(o))) throw new Error(`--only aceita: ${ENTITIES.join(", ")}`);

  const dryRun = flag("dry-run");
  console.log(`${dryRun ? "[SIMULAÇÃO] " : ""}Importando para "${chosen.organization.name}"…`);
  const report = await runAstreaImport({ organizationId: chosen.organizationId, importerUserId: user.id, dir, dryRun, only, timezone: chosen.organization.timezone, log: (m) => console.log(" ·", m) });

  console.log("\nResumo:");
  for (const [k, v] of Object.entries(report.entidades)) {
    console.log(`  ${k}: lidos ${v.lidos} | ${dryRun ? "seriam importados" : "importados"} ${v.importados} | já importados ${v.jaImportados}`);
    for (const [why, n] of Object.entries(v.ignorados)) console.log(`      ignorados (${why}): ${n}`);
    for (const [why, n] of Object.entries(v.avisos)) console.log(`      aviso (${why}): ${n}`);
  }
  console.log(`  usuários do Astrea sem e-mail correspondente no LegalOS: ${report.usuariosSemVinculo} (itens deles ficam com você como responsável)`);
  console.log("\nNão importado:");
  for (const l of report.naoImportado) console.log(`  - ${l}`);
  const out = arg("report");
  if (out) {
    fs.writeFileSync(path.resolve(out), JSON.stringify(report, null, 2));
    console.log(`\nRelatório salvo em ${out} (contém apenas contagens, sem dados pessoais).`);
  }
  await db.$disconnect();
}

main().catch((err) => {
  console.error("Falha na importação:", err instanceof Error ? err.message : err);
  process.exit(1);
});
