import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import { bulkUpdateNotices } from "@/server/services/notice-bulk.service";
import { listNotices } from "@/server/services/notice.service";
import { createTeam, listNoticeTags } from "@/server/services/inbox-flow.service";
import { addMember, makeOrgWithOwner } from "./helpers";

describe("Box: filtros, paginação e lotes", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  beforeAll(async () => {
    A = await makeOrgWithOwner("bulk-A"); B = await makeOrgWithOwner("bulk-B");
    lawyer = await addMember(A.org.id, "LAWYER", "bulk-law");
    finance = await addMember(A.org.id, "FINANCE", "bulk-fin");
  });
  const make = (extra: object = {}, org = A.org.id) => db.courtNotice.create({ data: { organizationId: org, title: "Publicação de teste", content: "Teor fictício", contentHash: randomUUID(), receivedAt: new Date("2026-10-22"), ...extra } });
  const select = (...rows: { id: string; updatedAt: Date }[]) => rows.map(n => ({ id: n.id, updatedAt: n.updatedAt.toISOString() }));

  it("percorre mais de 200 registros sem repetir ou omitir itens, com desempate estável", async () => {
    const prefix = `paging-${randomUUID()}`;
    await db.courtNotice.createMany({ data: Array.from({ length: 205 }, (_, i) => ({ organizationId: A.org.id, title: `${prefix}-${i}`, content: "c", contentHash: randomUUID(), receivedAt: new Date("2026-10-22"), createdAt: new Date("2026-10-22") })) });
    const ids: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const result = await listNotices(A.ctx, { q: prefix, page, pageSize: 100 });
      expect(result.total).toBe(205); expect(result.pageCount).toBe(3);
      ids.push(...result.items.map(n => n.id));
    }
    expect(ids).toHaveLength(205); expect(new Set(ids).size).toBe(205);
    expect((await listNotices(A.ctx, { q: prefix, page: 999, pageSize: 100 })).page).toBe(3);
    await expect(listNotices(A.ctx, { pageSize: 999 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("combina origem, órgão, tipo e intervalos inclusivos e recusa datas inválidas", async () => {
    const q = `filters-${randomUUID()}`;
    const a = await make({ title: q, source: "IMPORTED", externalKey: `djen:${randomUUID()}`, court: "Vara de Osasco", kind: "DECISAO", publishedAt: new Date("2026-10-20") });
    const b = await make({ title: q, source: "IMPORTED", externalKey: `mni:${randomUUID()}` });
    const c = await make({ title: q, source: "IMPORTED", externalKey: null });
    const d = await make({ title: q, source: "IMPORTED", externalKey: `api:${randomUUID()}` });
    const match = await listNotices(A.ctx, { q, origin: "DJEN", court: "osasco", kind: "DECISAO", receivedFrom: "2026-10-22", receivedTo: "2026-10-22", publishedFrom: "2026-10-20", publishedTo: "2026-10-20" });
    expect(match.items.map(n => n.id)).toEqual([a.id]);
    expect((await listNotices(A.ctx, { q, origin: "MNI" })).items.map(n => n.id)).toEqual([b.id]);
    expect(new Set((await listNotices(A.ctx, { q, origin: "OTHER_IMPORT" })).items.map(n => n.id))).toEqual(new Set([c.id, d.id]));
    await expect(listNotices(A.ctx, { publishedFrom: "2026-02-30" })).rejects.toBeInstanceOf(ValidationError);
    await expect(listNotices(A.ctx, { receivedFrom: "2026-10-22", receivedTo: "2026-10-01" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("não revela etiquetas de outro escritório ou processo sigiloso", async () => {
    const secret = await db.case.create({ data: { organizationId: A.org.id, title: "Sigiloso", confidential: true } });
    await make({ tags: ["segredo-exclusivo"], caseId: secret.id });
    await make({ tags: ["outro-escritorio"] }, B.org.id);
    const tags = await listNoticeTags(lawyer.ctx);
    expect(tags).not.toContain("segredo-exclusivo"); expect(tags).not.toContain("outro-escritorio");
  });

  it("distribui, notifica e audita cada item; equipe substitui o encarregado individual", async () => {
    const a = await make(); const b = await make();
    expect(await bulkUpdateNotices(A.ctx, { action: "ASSIGN_USER", selection: select(a, b), userId: lawyer.ctx.userId })).toEqual({ count: 2 });
    expect(await db.notification.count({ where: { organizationId: A.org.id, userId: lawyer.ctx.userId, link: { in: [a, b].map(n => `/caixa-de-entrada/${n.id}`) } } })).toBe(2);
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, resourceId: { in: [a.id, b.id] }, action: "notice.bulk.assign_user" } })).toBe(2);
    const fresh = await db.courtNotice.findMany({ where: { id: { in: [a.id, b.id] } } });
    const team = await createTeam(A.ctx, { name: "Lotes", memberIds: [lawyer.ctx.userId] });
    await bulkUpdateNotices(A.ctx, { action: "ASSIGN_TEAM", selection: select(...fresh), teamId: team.id });
    expect(await db.courtNotice.count({ where: { id: { in: [a.id, b.id] }, assigneeId: null, teamId: team.id, status: "DISTRIBUTED" } })).toBe(2);
  });

  it("recusa lote misto sem acesso, permissão ou destinatário habilitado, sem alterações parciais", async () => {
    const a = await make(); const other = await make({}, B.org.id);
    await expect(bulkUpdateNotices(A.ctx, { action: "PROCESS", selection: select(a, other) })).rejects.toBeInstanceOf(NotFoundError);
    await expect(bulkUpdateNotices(finance.ctx, { action: "PROCESS", selection: select(a) })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(bulkUpdateNotices(A.ctx, { action: "ASSIGN_USER", selection: select(a), userId: finance.ctx.userId })).rejects.toBeInstanceOf(ValidationError);
    const secret = await db.case.create({ data: { organizationId: A.org.id, title: "Segredo", confidential: true } });
    const hidden = await make({ caseId: secret.id });
    await expect(bulkUpdateNotices(lawyer.ctx, { action: "PROCESS", selection: select(a, hidden) })).rejects.toBeInstanceOf(NotFoundError);
    await expect(bulkUpdateNotices(A.ctx, { action: "ASSIGN_USER", selection: select(a, hidden), userId: lawyer.ctx.userId })).rejects.toBeInstanceOf(ValidationError);
    expect((await db.courtNotice.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("NEW");
    expect(await db.auditLog.count({ where: { resourceId: a.id, action: { startsWith: "notice.bulk." } } })).toBe(0);
  });

  it("recusa versões antigas e seleção repetida", async () => {
    const a = await make(); const b = await make();
    await db.courtNotice.update({ where: { id: b.id }, data: { updatedAt: new Date(b.updatedAt.getTime() + 1000), tags: ["recente"] } });
    await expect(bulkUpdateNotices(A.ctx, { action: "PROCESS", selection: select(a, b) })).rejects.toBeInstanceOf(ConflictError);
    await expect(bulkUpdateNotices(A.ctx, { action: "PROCESS", selection: select(a, a) })).rejects.toBeInstanceOf(ValidationError);
    expect((await db.courtNotice.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("NEW");
  });

  it("preserva etiquetas e desfaz também a auditoria se um item ultrapassar o limite", async () => {
    const rows = [await make({ tags: ["anterior"] }), await make({ tags: ["anterior"] })].sort((a, b) => a.id.localeCompare(b.id));
    rows[1] = await db.courtNotice.update({ where: { id: rows[1]!.id }, data: { tags: Array.from({ length: 10 }, (_, i) => `tag${i}`) } });
    await expect(bulkUpdateNotices(A.ctx, { action: "ADD_TAGS", selection: select(...rows), tags: ["nova"] })).rejects.toBeInstanceOf(ValidationError);
    expect((await db.courtNotice.findUniqueOrThrow({ where: { id: rows[0]!.id } })).tags).toEqual(["anterior"]);
    expect(await db.auditLog.count({ where: { resourceId: rows[0]!.id, action: "notice.bulk.add_tags" } })).toBe(0);
    await bulkUpdateNotices(A.ctx, { action: "ADD_TAGS", selection: select(rows[0]!), tags: [" NOVA ", "nova"] });
    expect((await db.courtNotice.findUniqueOrThrow({ where: { id: rows[0]!.id } })).tags).toEqual(["anterior", "nova"]);
  });

  it("adormece e trata com evento no processo e registro de quem tratou", async () => {
    const c = await db.case.create({ data: { organizationId: A.org.id, title: "Evento de tratamento" } });
    const n = await make({ caseId: c.id });
    await expect(bulkUpdateNotices(A.ctx, { action: "SNOOZE", selection: select(n), until: todayYmd(A.ctx.timezone) })).rejects.toBeInstanceOf(ValidationError);
    await bulkUpdateNotices(A.ctx, { action: "SNOOZE", selection: select(n), until: addDays(todayYmd(A.ctx.timezone), 2) });
    const fresh = await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } });
    await bulkUpdateNotices(A.ctx, { action: "PROCESS", selection: select(fresh) });
    expect(await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ status: "PROCESSED", processedById: A.ctx.userId, snoozedUntil: null });
    expect(await db.caseEvent.count({ where: { caseId: c.id, kind: "NOTICE_PROCESSED" } })).toBe(1);
    const done = await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } });
    await expect(bulkUpdateNotices(A.ctx, { action: "PROCESS", selection: select(done) })).rejects.toBeInstanceOf(ConflictError);
  });

  it("duas confirmações concorrentes não sobrescrevem uma à outra", async () => {
    const n = await make();
    const results = await Promise.allSettled(["primeira", "segunda"].map(tag => bulkUpdateNotices(A.ctx, { action: "ADD_TAGS", selection: select(n), tags: [tag] })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } })).tags).toHaveLength(1);
  });
});
