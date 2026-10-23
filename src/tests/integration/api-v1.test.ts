import { beforeAll, describe, expect, it } from "vitest";
import { GET as getMe } from "@/app/api/v1/me/route";
import { GET as listCases } from "@/app/api/v1/cases/route";
import { GET as getCase } from "@/app/api/v1/cases/[id]/route";
import { GET as listClients } from "@/app/api/v1/clients/route";
import { GET as listDeadlines } from "@/app/api/v1/deadlines/route";
import { GET as listNotices, POST as postNotice } from "@/app/api/v1/notices/route";
import { GET as getNotice } from "@/app/api/v1/notices/[id]/route";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { computeCnjCheck, formatCnj } from "@/lib/validation/br-documents";
import { totpCode, totpStep } from "@/lib/security/totp";
import { authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from "@/server/services/apikey.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const CNJ_PARTS = { sequence: "0000001", year: "2024", segment: "8", court: "05", origin: "0001" };
const CNJ = formatCnj(`${CNJ_PARTS.sequence}${computeCnjCheck(CNJ_PARTS)}${CNJ_PARTS.year}${CNJ_PARTS.segment}${CNJ_PARTS.court}${CNJ_PARTS.origin}`);

async function enableMfaFor(userId: string, email: string) {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}

const call = (fn: (r: Request, c: { params: Promise<Record<string, never>> }) => Promise<Response>, token: string | null, path: string, init: RequestInit = {}) =>
  fn(new Request(`http://localhost/api/v1/${path}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers as Record<string, string>) } }), { params: Promise.resolve({}) });
const callId = (fn: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>, token: string, id: string) =>
  fn(new Request("http://localhost/api/v1/x", { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ id }) });

describe("API pública v1 e chaves de API", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let tokenAll: string;
  let tokenRead: string;
  let tokenB: string;
  let openCaseId: string;
  let secretCaseId: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("api-A");
    B = await makeOrgWithOwner("api-B");
    for (const o of [A, B]) {
      const u = await db.user.findUniqueOrThrow({ where: { id: o.ctx.userId } });
      await enableMfaFor(u.id, u.email);
    }
    tokenAll = (await createApiKey(A.ctx, { name: "Tudo", scopes: ["cases:read", "clients:read", "deadlines:read", "notices:read", "notices:write"] })).token;
    tokenRead = (await createApiKey(A.ctx, { name: "Só processos", scopes: ["cases:read"] })).token;
    tokenB = (await createApiKey(B.ctx, { name: "Chave B", scopes: ["cases:read", "notices:read"] })).token;
    const open = await db.case.create({ data: { organizationId: A.org.id, title: "Aberto", number: CNJ } });
    const secret = await db.case.create({ data: { organizationId: A.org.id, title: "Sigiloso", confidential: true } });
    openCaseId = open.id;
    secretCaseId = secret.id;
    await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Maria Cliente", notes: "nota interna" } });
    await db.deadline.create({ data: { organizationId: A.org.id, caseId: openCaseId, title: "Contestar", dueDate: new Date("2026-12-01T00:00:00Z") } });
    await db.deadline.create({ data: { organizationId: A.org.id, caseId: secretCaseId, title: "Prazo sigiloso", dueDate: new Date("2026-12-02T00:00:00Z") } });
    await db.case.create({ data: { organizationId: B.org.id, title: "Do outro escritório" } });
  });

  it("criação: exige integrations:manage, 2FA, escopos válidos e permissão sobre cada escopo", async () => {
    const lawyer = await addMember(A.org.id, "LAWYER", "api-law");
    await expect(createApiKey(lawyer.ctx, { name: "xyz", scopes: ["cases:read"] })).rejects.toBeInstanceOf(ForbiddenError);
    const noMfa = await makeOrgWithOwner("api-nomfa");
    await expect(createApiKey(noMfa.ctx, { name: "xyz", scopes: ["cases:read"] })).rejects.toBeInstanceOf(ConflictError);
    await expect(createApiKey(A.ctx, { name: "ab", scopes: ["cases:read"] })).rejects.toBeInstanceOf(ValidationError);
    await expect(createApiKey(A.ctx, { name: "valido", scopes: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(createApiKey(A.ctx, { name: "valido", scopes: ["admin:all"] })).rejects.toBeInstanceOf(ValidationError);
    await expect(createApiKey(A.ctx, { name: "valido", scopes: ["cases:read"], expiresInDays: 0 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("o token só aparece na criação: o banco guarda apenas o hash", async () => {
    const rows = await db.apiKey.findMany({ where: { organizationId: A.org.id } });
    const secret = tokenAll.split("_").slice(2).join("_");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) {
      expect(r.keyHash).not.toContain(secret);
      expect(JSON.stringify(r)).not.toContain(secret);
    }
    const list = await listApiKeys(A.ctx);
    expect(JSON.stringify(list)).not.toContain(secret);
    expect(list.every((k) => k.status === "ACTIVE")).toBe(true);
  });

  it("autenticação: token errado, malformado, sem cabeçalho → 401", async () => {
    expect((await call(getMe, null, "me")).status).toBe(401);
    expect((await call(getMe, "lixo", "me")).status).toBe(401);
    const wrong = tokenAll.slice(0, -2) + (tokenAll.endsWith("aa") ? "bb" : "aa");
    expect((await call(getMe, wrong, "me")).status).toBe(401);
    const r = await call(getMe, tokenAll, "me");
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.data.organization.id).toBe(A.org.id);
    expect(body.data.scopes).toContain("notices:write");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("escopo: chave só de processos não lê clientes nem registra intimações (403)", async () => {
    expect((await call(listCases, tokenRead, "cases")).status).toBe(200);
    const c = await call(listClients, tokenRead, "clients");
    expect(c.status).toBe(403);
    expect((await c.json()).error.code).toBe("insufficient_scope");
    const p = await call(postNotice, tokenRead, "notices", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(p.status).toBe(403);
  });

  it("processos: isolamento entre escritórios; chave de administrador enxerga sigilosos", async () => {
    const bodyA = await (await call(listCases, tokenAll, "cases")).json();
    expect(bodyA.data.map((c: { title: string }) => c.title).sort()).toEqual(["Aberto", "Sigiloso"]);
    const bodyB = await (await call(listCases, tokenB, "cases")).json();
    expect(bodyB.data.map((c: { title: string }) => c.title)).toEqual(["Do outro escritório"]);
    expect((await callId(getCase, tokenB, openCaseId)).status).toBe(404);
    expect((await callId(getCase, tokenAll, openCaseId)).status).toBe(200);
    expect((await callId(getCase, tokenAll, "nao-e-uuid")).status).toBe(422);
  });

  it("sigilo para quem não administra: o contexto da chave usa as regras do criador", async () => {
    const lawyer = await addMember(A.org.id, "LAWYER", "api-law3");
    const { apiListCases } = await import("@/server/services/public-api.service");
    const r = await apiListCases(lawyer.ctx, {});
    expect(r.data.map((c) => c.title)).toEqual(["Aberto"]);
  });

  it("clientes não expõem anotações internas; prazos de processo sigiloso aparecem só se o criador vê o processo", async () => {
    const cl = await (await call(listClients, tokenAll, "clients")).json();
    expect(cl.data).toHaveLength(1);
    expect(JSON.stringify(cl)).not.toContain("nota interna");
    const dl = await (await call(listDeadlines, tokenAll, "deadlines?from=2026-12-01&to=2026-12-31")).json();
    expect(dl.data.map((d: { title: string }) => d.title).sort()).toEqual(["Contestar", "Prazo sigiloso"]);
    expect(dl.data[0].dueDate).toMatch(/^2026-12-0\d$/);
    expect((await call(listDeadlines, tokenAll, "deadlines?status=NADA")).status).toBe(422);
    expect((await call(listDeadlines, tokenAll, "deadlines?from=01/12/2026")).status).toBe(422);
  });

  it("paginação por cursor: sem repetir nem perder", async () => {
    for (let i = 0; i < 5; i++) await db.case.create({ data: { organizationId: A.org.id, title: `Pag ${i}` } });
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const r: { data: { id: string }[]; nextCursor: string | null } = await (await call(listCases, tokenAll, `cases?limit=3${cursor ? `&cursor=${cursor}` : ""}`)).json();
      seen.push(...r.data.map((c) => c.id));
      cursor = r.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(await db.case.count({ where: { organizationId: A.org.id, deletedAt: null } }));
    expect((await call(listCases, tokenAll, "cases?limit=101")).status).toBe(422);
    expect((await call(listCases, tokenAll, "cases?cursor=zzz")).status).toBe(422);
  });

  it("intimações: cria, é idempotente por externalId, valida e respeita escritório", async () => {
    const post = (b: unknown, t = tokenAll, ct = "application/json") => call(postNotice, t, "notices", { method: "POST", headers: { "content-type": ct }, body: typeof b === "string" ? b : JSON.stringify(b) });
    const payload = { title: "Intimação para manifestação", content: "Fica intimada a parte para se manifestar em 5 dias.", caseNumber: CNJ, externalId: "erp-123" };
    const first = await post(payload);
    expect(first.status).toBe(201);
    const f = await first.json();
    expect(f.created).toBe(true);
    expect(f.data.source).toBe("IMPORTED");
    expect(f.data.caseId).toBe(openCaseId);
    const again = await post(payload);
    expect(again.status).toBe(200);
    const a = await again.json();
    expect(a.created).toBe(false);
    expect(a.data.id).toBe(f.data.id);
    expect(await db.courtNotice.count({ where: { organizationId: A.org.id, externalKey: "api:erp-123" } })).toBe(1);
    expect((await post({ title: "x" })).status).toBe(422);
    expect((await post({ ...payload, externalId: undefined, caseNumber: "123" })).status).toBe(422);
    expect((await post("{ruim")).status).toBe(422);
    expect((await post("[]")).status).toBe(422);
    expect((await post(payload, tokenAll, "text/plain")).status).toBe(422);
    const list = await (await call(listNotices, tokenAll, "notices")).json();
    expect(list.data.find((n: { id: string }) => n.id === f.data.id)).toBeTruthy();
    expect(list.data[0]).not.toHaveProperty("content");
    const one = await (await callId(getNotice, tokenAll, f.data.id)).json();
    expect(one.data.content).toContain("manifestar");
    expect((await callId(getNotice, tokenB, f.data.id)).status).toBe(404);
    const listB = await (await call(listNotices, tokenB, "notices")).json();
    expect(listB.data).toHaveLength(0);
  });

  it("revogação e expiração derrubam a chave; criador que sai do escritório também", async () => {
    const k = await createApiKey(A.ctx, { name: "Temporária", scopes: ["cases:read"] });
    expect((await call(listCases, k.token, "cases")).status).toBe(200);
    await revokeApiKey(A.ctx, k.id);
    expect((await call(listCases, k.token, "cases")).status).toBe(401);
    await expect(revokeApiKey(A.ctx, k.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeApiKey(B.ctx, k.id)).rejects.toBeInstanceOf(NotFoundError);

    const e = await createApiKey(A.ctx, { name: "Expira", scopes: ["cases:read"], expiresInDays: 1 });
    await db.apiKey.update({ where: { id: e.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await authenticateApiKey(e.token)).toBeNull();

    const boss = await addMember(A.org.id, "ADMIN", "api-boss");
    const bu = await db.user.findUniqueOrThrow({ where: { id: boss.ctx.userId } });
    await enableMfaFor(bu.id, bu.email);
    const bk = await createApiKey(boss.ctx, { name: "Do admin", scopes: ["cases:read"] });
    expect(await authenticateApiKey(bk.token)).not.toBeNull();
    await db.membership.update({ where: { id: boss.membership.id }, data: { status: "SUSPENDED" } });
    expect(await authenticateApiKey(bk.token)).toBeNull();
  });

  it("escritório suspenso derruba as chaves", async () => {
    const S = await makeOrgWithOwner("api-susp");
    const u = await db.user.findUniqueOrThrow({ where: { id: S.ctx.userId } });
    await enableMfaFor(u.id, u.email);
    const k = await createApiKey(S.ctx, { name: "Susp", scopes: ["cases:read"] });
    expect(await authenticateApiKey(k.token)).not.toBeNull();
    await db.organization.update({ where: { id: S.org.id }, data: { suspendedAt: new Date(), suspendedReason: "teste" } });
    expect(await authenticateApiKey(k.token)).toBeNull();
  });

  it("auditoria registra criação e revogação sem o token", async () => {
    const logs = await db.auditLog.findMany({ where: { organizationId: A.org.id, action: { in: ["apikey.create", "apikey.revoke"] } } });
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(logs)).not.toContain(tokenAll.split("_").slice(2).join("_"));
  });
});
