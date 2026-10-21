import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { verifyPassword } from "@/lib/security/password";
import { readTeam, seedAstreaTeam } from "@/server/import/astrea-team";
import { makeOrgWithOwner } from "./helpers";

function writeCsv(dir: string, name: string, header: string[], rows: string[][]) {
  const q = (v: string) => `"${v.replaceAll('"', '""')}"`;
  fs.writeFileSync(path.join(dir, `${name}.csv`), [header, ...rows].map((r) => r.map(q).join(",")).join("\n"));
}

describe("equipe do Astrea → escritório de demonstração", () => {
  let org: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let dir: string;
  const tag = Math.random().toString(36).slice(2, 7);
  const e = (n: string) => `${n}-${tag}@equipe.test`;

  beforeAll(async () => {
    org = await makeOrgWithOwner("team-A");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "astrea-team-"));
    const H = ["Código", "Login", "Apelido", "Contato", "Status", "Acesso financeiro", "Administrador", "Tipo", "Perfil"];
    writeCsv(dir, "Usuário", H, [
      ["u1", org.owner.email, "DONA", "k1", "Ativo", "Sim", "Sim", "Usuário", "Coordenador"],
      ["u2", e("dra.ana"), "ANA", "k2", "Ativo", "Não", "Sim", "Usuário", "Coordenador"],
      ["u3", e("fin"), "FIN", "k3", "Ativo", "Sim", "Não", "Usuário", "Colaborador"],
      ["u4", e("secretaria"), "SECRETARIA", "k4", "Ativo", "Não", "Sim", "Usuário", "Coordenador"],
      ["u5", e("saiu"), "EX", "k5", "Inativo", "Não", "Sim", "Usuário", "Coordenador"],
      ["u6", e("cliente"), "CLIENTE", "k6", "Ativo", "Não", "Não", "Cliente", "Coordenador"],
      ["u7", e("chefe"), "CHEFE", "k7", "Ativo", "Sim", "Sim", "Usuário", "Coordenador"],
    ]);
    writeCsv(dir, "Contatos", ["Código", "Nome"], [["k2", "ANA PAULA SOUZA"], ["k4", "Maria da Secretaria"]]);
  });

  it("lê só equipe ativa (sem inativos nem clientes de portal), com nome completo e papéis sugeridos", () => {
    const t = readTeam(dir, [org.owner.email]);
    const by = Object.fromEntries(t.map((m) => [m.email, m]));
    expect(t).toHaveLength(5);
    expect(by[e("saiu")]).toBeUndefined();
    expect(by[e("cliente")]).toBeUndefined();
    expect(by[e("dra.ana")]).toMatchObject({ name: "Ana Paula Souza", roleKey: "LAWYER" });
    expect(by[e("secretaria")]?.roleKey).toBe("ASSISTANT");
    expect(by[e("fin")]?.roleKey).toBe("FINANCE");
    expect(by[e("chefe")]?.roleKey).toBe("ADMIN");
    expect(by[org.owner.email.toLowerCase()]?.roleKey).toBe("OWNER");
    expect(readTeam(dir, [], { [e("secretaria")]: "LAWYER" }).find((m) => m.email === e("secretaria"))?.roleKey).toBe("LAWYER");
  });

  it("simulação não grava nada", async () => {
    const r = await seedAstreaTeam({ organizationId: org.org.id, dir, ownerEmails: [org.owner.email], dryRun: true });
    expect(r.contasCriadas).toBe(4);
    expect(await db.user.count({ where: { email: { endsWith: `-${tag}@equipe.test` } } })).toBe(0);
  });

  it("grava: cria contas sem senha utilizável, vincula e é idempotente", async () => {
    const r = await seedAstreaTeam({ organizationId: org.org.id, dir, ownerEmails: [org.owner.email], dryRun: false });
    expect(r).toMatchObject({ contasCriadas: 4, contasExistentes: 1, vinculosCriados: 4, jaEramMembros: 1 });
    const ana = await db.user.findUnique({ where: { email: e("dra.ana") }, include: { memberships: { include: { role: true } } } });
    expect(ana?.name).toBe("Ana Paula Souza");
    expect(ana?.emailVerifiedAt).toBeNull();
    expect(ana?.memberships[0]?.role.key).toBe("LAWYER");
    expect(ana?.memberships[0]?.organizationId).toBe(org.org.id);
    // nenhuma senha comum abre a conta
    for (const pw of ["", "senha", "SenhaForte123", e("dra.ana")]) expect(await verifyPassword(pw, ana!.passwordHash)).toBe(false);
    // a dona continua dona (não foi rebaixada)
    const dono = await db.membership.findFirst({ where: { organizationId: org.org.id, user: { email: org.owner.email.toLowerCase() } }, include: { role: true } });
    expect(dono?.role.key).toBe("OWNER");
    const again = await seedAstreaTeam({ organizationId: org.org.id, dir, ownerEmails: [org.owner.email], dryRun: false });
    expect(again).toMatchObject({ contasCriadas: 0, vinculosCriados: 0, jaEramMembros: 5 });
  });

  it("não cria vínculo em outro escritório", async () => {
    const other = await makeOrgWithOwner("team-B");
    expect(await db.membership.count({ where: { organizationId: other.org.id } })).toBe(1);
  });
});
