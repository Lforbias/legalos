import "./load-env";
import { db } from "../src/lib/db/client";
import { hasLegacyCompletionNote } from "../src/lib/import/astrea-map";

/** Diagnóstico somente leitura. Nunca conclui, reabre ou reimporta tarefas. */
async function main() {
  const i = process.argv.indexOf("--org");
  const organizationId = i >= 0 ? process.argv[i + 1] : undefined;
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) {
    throw new Error("Uso: npm run audit:astrea-tasks -- --org <id do escritório>");
  }
  const maps = await db.importMap.findMany({ where: { organizationId, source: "astrea", entity: "task" }, select: { internalId: true, externalId: true } });
  const external = new Map(maps.map((m) => [m.internalId, m.externalId]));
  let checked = 0;
  const candidates: { id: string; astreaId: string; status: string; updatedAt: string }[] = [];
  for (let start = 0; start < maps.length; start += 1000) {
    const tasks = await db.task.findMany({
      where: { organizationId, id: { in: maps.slice(start, start + 1000).map((m) => m.internalId) }, deletedAt: null, status: { notIn: ["DONE", "CANCELED"] } },
      select: { id: true, status: true, description: true, updatedAt: true },
      orderBy: { id: "asc" },
    });
    checked += tasks.length;
    for (const t of tasks) if (hasLegacyCompletionNote(t.description)) {
      candidates.push({ id: t.id, astreaId: external.get(t.id)!, status: t.status, updatedAt: t.updatedAt.toISOString() });
    }
  }
  console.log(JSON.stringify({
    readOnly: true, organizationId, checked, candidateCount: candidates.length,
    note: "Indícios, não erros confirmados. Confira Realizada no CSV de origem e o histórico de reabertura antes de corrigir. Nenhuma tarefa foi alterada.",
    candidates,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha no diagnóstico.");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
