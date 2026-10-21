import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { runAstreaImport } from "@/server/import/astrea-import";
import { addMember, makeOrgWithOwner } from "./helpers";

function writeCsv(dir: string, name: string, header: string[], rows: string[][]) {
  const q = (v: string) => `"${v.replaceAll('"', '""')}"`;
  fs.writeFileSync(path.join(dir, `${name}.csv`), [header, ...rows].map((r) => r.map(q).join(",")).join("\n"));
}
const row = (header: string[], o: Record<string, string>) => header.map((h) => o[h] ?? "");

const H = {
  contatos: ["Código", "Nome", "Tipo do contato", "Classificação", "CPF", "Endereços de email", "Número dos telefones", "Estados", "Cidades"],
  processos: ["Código", "Titulo", "Clientes", "Qualificações dos clientes", "Responsável", "Tipo", "Status", "Instância", "Usuários", "Número do processo", "Nome da Vara", "Data de criação", "Contatos das partes", "Qualificações das partes", "Data de encerramento"],
  prazos: ["Código", "Nome", "Data de vencimento", "Processo", "Responsável", "Status"],
  tarefas: ["Código", "Descrição", "Realizada", "Data de vencimento", "Processo", "Prioridade", "Responsável", "Data fim", "Data de criação"],
  audiencias: ["Código", "Nome", "Data de início", "Hora de início", "Hora de fim", "Fórum", "Processo", "Status"],
  eventos: ["Código", "Data de início", "Hora de início", "Dia inteiro", "Descrição", "Processo", "Status"],
  pubs: ["Código", "Orgão", "Data publicacao", "Data de lançamento", "Matéria", "Status", "Processo"],
  usuario: ["Código", "Login", "Tipo"],
  qual: ["Código", "Nome", "Tipo"],
};

describe("importador Astrea (dados fictícios)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let dir: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("imp-A");
    B = await makeOrgWithOwner("imp-B");
    lawyer = await addMember(A.org.id, "LAWYER", "imp-l");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "astrea-"));
    writeCsv(dir, "Usuário", H.usuario, [
      ["u1", lawyer.user.email, "Usuário"],
      ["u2", "ninguem@outro.test", "Usuário"],
      ["u3", "cliente@x.test", "Cliente"],
    ]);
    writeCsv(dir, "Qualificações", H.qual, [["q1", "Cliente", "Ativo"], ["q2", "Réu", "Passivo"]]);
    writeCsv(dir, "Contatos", H.contatos, [
      row(H.contatos, { Código: "c1", Nome: "Ana Cliente", "Tipo do contato": "Pessoa Física", Classificação: "Cliente", CPF: "529.982.247-25", "Endereços de email": "ANA@x.test", "Número dos telefones": "11912345678", Estados: "SP", Cidades: "São Paulo" }),
      row(H.contatos, { Código: "c2", Nome: "Beto Duplicado", "Tipo do contato": "Pessoa Física", Classificação: "Cliente", CPF: "52998224725" }),
      row(H.contatos, { Código: "c3", Nome: "Réu Contrário", "Tipo do contato": "Pessoa Física", Classificação: "Contato", CPF: "" }),
      row(H.contatos, { Código: "c4", Nome: "Contato Solto", "Tipo do contato": "Pessoa Física", Classificação: "Contato" }),
      row(H.contatos, { Código: "c5", Nome: "Empresa Teste", "Tipo do contato": "Pessoa Jurídica", Classificação: "Cliente", CPF: "11.222.333/0001-81" }),
      row(H.contatos, { Código: "c6", Nome: "Cliente CPF ruim", "Tipo do contato": "Pessoa Física", Classificação: "Cliente", CPF: "111.111.111-11" }),
    ]);
    writeCsv(dir, "Processos", H.processos, [
      row(H.processos, { Código: "p1", Titulo: "Ana x Réu", Clientes: "c1", "Qualificações dos clientes": "q1", Responsável: "u1", Tipo: "Processo", Status: "Ativo", Instância: "1", Usuários: "u1; u2", "Número do processo": "5015905-44.2022.4.03.6183", "Nome da Vara": "9ª Vara", "Data de criação": "07/12/2022 14:45", "Contatos das partes": "c3", "Qualificações das partes": "q2" }),
      row(H.processos, { Código: "p2", Titulo: "Outro com mesmo CNJ", Clientes: "c2", Responsável: "u2", Tipo: "Caso", Status: "Inativo", "Número do processo": "5015905-44.2022.4.03.6183", "Data de encerramento": "14/05/2025 15:09" }),
      row(H.processos, { Código: "p3", Titulo: "Atendimento inicial", Clientes: "c5", Tipo: "Atendimento", Status: "Ativo" }),
      row(H.processos, { Código: "p4", Titulo: "Legado", Clientes: "c5", Tipo: "Processo", Status: "Inativo", "Número do processo": "444110131" }),
    ]);
    writeCsv(dir, "Prazos", H.prazos, [
      ["d1", "Contestar", "2025-08-19", "p1", "u1", "Feito"],
      ["d2", "Recurso", "2026-12-01", "p1", "u1", "Em progresso"],
      ["d3", "Sem processo", "2026-12-01", "", "u1", "Feito"],
      ["d4", "Processo inexistente", "2026-12-01", "zzz", "u1", "Feito"],
    ]);
    writeCsv(dir, "Tarefas", H.tarefas, [
      row(H.tarefas, { Código: "t1", Descrição: "Protocolar petição", Realizada: "Sim", "Data de vencimento": "21/10/2024 06:00", Processo: "p1", Prioridade: "Alta", Responsável: "u1", "Data fim": "22/10/2024 10:00", "Data de criação": "01/10/2024 09:00" }),
      row(H.tarefas, { Código: "t2", Descrição: "Ligar para cliente", Realizada: "Não", Processo: "zzz", Prioridade: "Média", Responsável: "u2" }),
    ]);
    writeCsv(dir, "Audiências", H.audiencias, [
      ["a1", "Audiência de instrução", "2025-04-23", "08:00", "09:00", "Fórum Central", "p1", "Feito"],
      ["a2", "Audiência cancelada", "2025-05-01", "10:00", "", "", "p1", "Cancelado"],
    ]);
    writeCsv(dir, "Eventos", H.eventos, [["e1", "19/04/2024", "", "Sim", "Reunião interna", "", "Feito"]]);
    writeCsv(dir, "Publicações", H.pubs, [
      ["n1", "1A VARA CIVEL", "25/07/2023 09:00", "2023-07-26", "Intime-se a parte autora. Processo 5015905-44.2022.4.03.6183.", "Tratada", "p1"],
      ["n2", "2A VARA", "01/08/2023 09:00", "2023-08-02", "Despacho de mero expediente.", "Rejeitada", ""],
      ["n3", "3A VARA", "01/09/2023 09:00", "2023-09-02", "Cite-se.", "Recebido", ""],
    ]);
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const count = async (t: "client" | "case" | "task" | "deadline" | "agendaEvent" | "courtNotice", orgId = A.org.id) => (db[t] as unknown as { count(a: unknown): Promise<number> }).count({ where: { organizationId: orgId } });

  it("simulação não grava nada e já informa o que aconteceria", async () => {
    const r = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir, dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.entidades.clientes?.importados).toBe(4); // c1, c2, c5 e c6 (c3 é só parte contrária: não vira cliente)
    expect(r.entidades.processos?.importados).toBe(3);
    expect(await count("client")).toBe(0);
    expect(await count("case")).toBe(0);
    expect(await db.importMap.count({ where: { organizationId: A.org.id } })).toBe(0);
  });

  it("recusa importador que não é membro do escritório", async () => {
    await expect(runAstreaImport({ organizationId: A.org.id, importerUserId: B.owner.id, dir, dryRun: true })).rejects.toThrow(/membro/);
  });

  it("importa tudo com vínculos, status e fuso corretos", async () => {
    const r = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir });
    expect(r.usuariosSemVinculo).toBe(1);
    expect(r.entidades.processos?.ignorados["atendimento (não é processo)"]).toBe(1);
    expect(r.entidades.prazos?.ignorados["processo não importado"]).toBe(1);
    expect(r.entidades.agenda?.ignorados["cancelado no Astrea"]).toBe(1);

    // clientes
    const ana = await db.client.findFirstOrThrow({ where: { organizationId: A.org.id, name: "Ana Cliente" } });
    expect(ana).toMatchObject({ document: "52998224725", email: "ana@x.test", phone: "11912345678", addressState: "SP", type: "PERSON" });
    const beto = await db.client.findFirstOrThrow({ where: { organizationId: A.org.id, name: "Beto Duplicado" } });
    expect(beto.document).toBeNull(); // CPF repetido não duplica
    expect(beto.notes).toContain("já existe");
    const ruim = await db.client.findFirstOrThrow({ where: { organizationId: A.org.id, name: "Cliente CPF ruim" } });
    expect(ruim.document).toBeNull();
    expect(ruim.notes).toContain("111.111.111-11");
    expect((await db.client.findFirstOrThrow({ where: { organizationId: A.org.id, name: "Empresa Teste" } })).type).toBe("COMPANY");
    expect(await db.client.count({ where: { organizationId: A.org.id, name: "Contato Solto" } })).toBe(0);

    // processos
    const p1 = await db.case.findFirstOrThrow({ where: { organizationId: A.org.id, title: "Ana x Réu" }, include: { parties: true, members: true, events: true } });
    expect(p1).toMatchObject({ number: "5015905-44.2022.4.03.6183", status: "ACTIVE", phase: "1ª instância", courtUnit: "9ª Vara", confidential: false });
    expect(p1.createdAt.toISOString().slice(0, 10)).toBe("2022-12-07");
    expect(p1.parties.map((p) => [p.name, p.role, p.isOurClient, p.clientId ? "cli" : "-"]).sort()).toEqual([
      ["Ana Cliente", "PLAINTIFF", true, "cli"],
      ["Réu Contrário", "DEFENDANT", false, "-"],
    ]);
    expect(p1.members.find((m) => m.role === "RESPONSIBLE")?.userId).toBe(lawyer.user.id);
    expect(p1.events[0]).toMatchObject({ kind: "IMPORT", source: "IMPORTED" });
    const p2 = await db.case.findFirstOrThrow({ where: { organizationId: A.org.id, title: "Outro com mesmo CNJ" }, include: { members: true } });
    expect(p2).toMatchObject({ number: null, legacyNumber: "5015905-44.2022.4.03.6183", status: "CLOSED" });
    expect(p2.members[0]?.userId).toBe(A.owner.id); // u2 sem vínculo → quem importou
    expect((await db.case.findFirstOrThrow({ where: { organizationId: A.org.id, title: "Legado" } })).legacyNumber).toBe("444110131");
    expect(await db.case.count({ where: { organizationId: A.org.id, title: "Atendimento inicial" } })).toBe(0);

    // prazos
    const dl = await db.deadline.findMany({ where: { organizationId: A.org.id }, orderBy: { title: "asc" } });
    expect(dl.map((d) => [d.title, d.status, d.source])).toEqual([["Contestar", "FULFILLED", "IMPORTED"], ["Recurso", "DRAFT", "IMPORTED"]]);
    expect(dl[0]?.validatedAt).not.toBeNull();
    expect(dl[1]?.validatedAt).toBeNull();

    // tarefas
    const t1 = await db.task.findFirstOrThrow({ where: { organizationId: A.org.id, title: "Protocolar petição" } });
    expect(t1).toMatchObject({ status: "DONE", priority: "HIGH", assigneeId: lawyer.user.id, caseId: p1.id });
    expect(t1.dueDate?.toISOString().slice(0, 10)).toBe("2024-10-21");
    const t2 = await db.task.findFirstOrThrow({ where: { organizationId: A.org.id, title: "Ligar para cliente" } });
    expect(t2).toMatchObject({ status: "TODO", priority: "NORMAL", caseId: null });
    expect(t2.description).toContain("não foi importado");

    // agenda: 08:00 em São Paulo = 11:00 UTC (sem horário de verão em 2025)
    const hearing = await db.agendaEvent.findFirstOrThrow({ where: { organizationId: A.org.id, title: "Audiência de instrução" } });
    expect(hearing).toMatchObject({ kind: "HEARING", caseId: p1.id, location: "Fórum Central" });
    expect(hearing.startsAt.toISOString()).toBe("2025-04-23T11:00:00.000Z");
    expect(hearing.endsAt?.toISOString()).toBe("2025-04-23T12:00:00.000Z");
    expect((await db.agendaEvent.findFirstOrThrow({ where: { organizationId: A.org.id, title: "Reunião interna" } })).allDay).toBe(true);
    expect(await db.agendaEvent.count({ where: { organizationId: A.org.id, title: "Audiência cancelada" } })).toBe(0);

    // intimações
    const n = await db.courtNotice.findMany({ where: { organizationId: A.org.id }, orderBy: { content: "asc" } });
    expect(n.map((x) => x.status).sort()).toEqual(["DISCARDED", "NEW", "PROCESSED"]);
    const tratada = n.find((x) => x.status === "PROCESSED")!;
    expect(tratada).toMatchObject({ source: "IMPORTED", caseId: p1.id, caseNumber: "5015905-44.2022.4.03.6183", processedById: A.owner.id });
    expect(n.find((x) => x.status === "DISCARDED")?.discardReason).toBeTruthy();

    // outro escritório intacto
    for (const t of ["client", "case", "task", "deadline", "agendaEvent", "courtNotice"] as const) expect(await count(t, B.org.id)).toBe(0);
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "import.astrea" } })).toBe(1);
  });

  it("rodar de novo não duplica nada", async () => {
    const before = { c: await count("client"), p: await count("case"), t: await count("task"), d: await count("deadline"), a: await count("agendaEvent"), n: await count("courtNotice") };
    const r = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir });
    for (const e of Object.values(r.entidades)) expect(e.importados).toBe(0);
    expect(r.entidades.processos?.jaImportados).toBe(3);
    expect(r.entidades.tarefas?.jaImportados).toBe(2);
    expect({ c: await count("client"), p: await count("case"), t: await count("task"), d: await count("deadline"), a: await count("agendaEvent"), n: await count("courtNotice") }).toEqual(before);
  });

  it("importação parcial (--only) respeita a seleção e depende só do que já existe", async () => {
    const C = await makeOrgWithOwner("imp-C");
    const r = await runAstreaImport({ organizationId: C.org.id, importerUserId: C.owner.id, dir, only: ["intimacoes"] });
    expect(Object.keys(r.entidades)).toEqual(["intimacoes"]);
    expect(await count("courtNotice", C.org.id)).toBe(3);
    expect(await count("case", C.org.id)).toBe(0);
    expect(await db.courtNotice.count({ where: { organizationId: C.org.id, caseId: { not: null } } })).toBe(0);
  });
});
