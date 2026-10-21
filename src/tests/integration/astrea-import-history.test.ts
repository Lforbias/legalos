import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { mapHistory } from "@/lib/import/astrea-map";
import { runAstreaImport } from "@/server/import/astrea-import";
import { addMember, makeOrgWithOwner } from "./helpers";

function writeCsv(dir: string, name: string, header: string[], rows: string[][]) {
  const q = (v: string) => `"${v.replaceAll('"', '""')}"`;
  fs.writeFileSync(path.join(dir, `${name}.csv`), [header, ...rows].map((r) => r.map(q).join(",")).join("\n"));
}
const PH = ["Código", "Titulo", "Clientes", "Responsável", "Tipo", "Status", "Número do processo", "Data de criação"];
const HH = ["Código", "Descrição", "Data", "Tipo", "Responsável", "Processo", "Etiquetas", "Número da Instância"];

describe("importador Astrea: andamentos (Históricos.csv)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let dir: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("hist-A");
    lawyer = await addMember(A.org.id, "LAWYER", "hist-l");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "astrea-hist-"));
    writeCsv(dir, "Usuário", ["Código", "Login", "Tipo"], [["u1", lawyer.user.email, "Usuário"]]);
    writeCsv(dir, "Contatos", ["Código", "Nome", "Tipo do contato", "Classificação"], [["c1", "Ana Cliente", "Pessoa Física", "Cliente"]]);
    writeCsv(dir, "Processos", PH, [
      ["p1", "Ana x Réu", "c1", "u1", "Processo", "Ativo", "5015905-44.2022.4.03.6183", "07/12/2022 14:45"],
      ["p3", "Atendimento", "c1", "", "Atendimento", "Ativo", "", ""],
    ]);
    writeCsv(dir, "Históricos", HH, [
      ["h1", "Juntada de petição\nCom detalhes do ato.", "10/03/2024 09:30", "Andamento", "u1", "p1", "", ""],
      ["h2", "Cliente ligou pedindo notícias", "11/03/2024 14:00", "Manual", "u9", "p1", "", ""],
      ["h3", "Tarefa concluída X", "12/03/2024 14:00", "Tarefa realizada", "u1", "p1", "", ""],
      ["h4", "Publicação Y", "12/03/2024 14:00", "Publicação", "", "p1", "", ""],
      ["h5", "Andamento de atendimento", "12/03/2024 14:00", "Andamento", "u1", "p3", "", ""],
      ["h6", "Andamento órfão", "12/03/2024 14:00", "Andamento", "u1", "zzz", "", ""],
      ["h7", "", "12/03/2024 14:00", "Andamento", "u1", "p1", "", ""],
      ["h8", "Data inválida", "32/13/2024", "Andamento", "u1", "p1", "", ""],
    ]);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("mapHistory: só andamento e manual; título = primeira linha; descrição só quando há mais", () => {
    const base = { Código: "x", Processo: "p", Data: "05/01/2024 08:15", Responsável: "u" };
    expect(mapHistory({ ...base, Tipo: "Andamento", Descrição: "Linha única" })).toMatchObject({ kind: "ANDAMENTO", title: "Linha única", description: null, ymd: "2024-01-05", hhmm: "08:15" });
    expect(mapHistory({ ...base, Tipo: "Manual", Descrição: "A\nB" })).toMatchObject({ kind: "NOTE", title: "A", description: "A\nB" });
    expect(mapHistory({ ...base, Tipo: "Prazo", Descrição: "x" })).toBeNull();
    expect(mapHistory({ ...base, Tipo: "Andamento", Descrição: "" })).toBeNull();
    const longo = mapHistory({ ...base, Tipo: "Andamento", Descrição: "z".repeat(500) });
    expect(longo?.title.length).toBeLessThanOrEqual(200);
    expect(longo?.description?.length).toBe(500);
  });

  it("simulação não grava; importação grava só o aproveitável, com autor, fuso e idempotência", async () => {
    const sim = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir, dryRun: true });
    expect(sim.entidades.andamentos?.importados).toBe(2);
    expect(await db.caseEvent.count({ where: { organizationId: A.org.id } })).toBe(0);

    const r = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir });
    const a = r.entidades.andamentos!;
    expect(a).toMatchObject({ lidos: 8, importados: 2, jaImportados: 0 });
    expect(a.ignorados["tarefa realizada (já importada como tarefa)"]).toBe(1);
    expect(a.ignorados["publicação (já importada como intimação)"]).toBe(1);
    expect(a.ignorados["processo não importado (atendimento ou fora do backup)"]).toBe(2);
    expect(a.ignorados["sem texto, data ou processo"]).toBe(2);

    const c = await db.case.findFirstOrThrow({ where: { organizationId: A.org.id, title: "Ana x Réu" } });
    const ev = await db.caseEvent.findMany({ where: { caseId: c.id, kind: { in: ["ANDAMENTO", "NOTE"] } }, orderBy: { occurredAt: "asc" } });
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ kind: "ANDAMENTO", title: "Juntada de petição", description: "Juntada de petição\nCom detalhes do ato.", source: "IMPORTED", createdById: lawyer.user.id });
    expect(ev[0]!.occurredAt.toISOString()).toBe("2024-03-10T12:30:00.000Z"); // 09:30 em São Paulo (UTC-3)
    expect(ev[1]).toMatchObject({ kind: "NOTE", createdById: null }); // responsável sem correspondência: não vira o importador

    const again = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir });
    expect(again.entidades.andamentos).toMatchObject({ importados: 0, jaImportados: 2 });
    expect(await db.caseEvent.count({ where: { caseId: c.id, kind: { in: ["ANDAMENTO", "NOTE"] } } })).toBe(2);
  });
});
