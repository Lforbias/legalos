import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { countNewNotices, getBoxDashboard } from "@/server/services/box.service";
import { getNoticeActivity } from "@/server/services/notice-activity.service";
import { addMember, makeOrgWithOwner } from "./helpers";

describe("painel do LegalOS Box", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;

  const notice = (org: string, title: string, extra: Record<string, unknown> = {}) =>
    db.courtNotice.create({ data: { organizationId: org, title, content: `Conteúdo ${title} com texto suficiente`, contentHash: `box-${org}-${title}`, receivedAt: new Date(), status: "NEW", kind: "INTIMACAO", ...extra } });

  beforeAll(async () => {
    A = await makeOrgWithOwner("box-A");
    B = await makeOrgWithOwner("box-B");
    finance = await addMember(A.org.id, "FINANCE", "box-fin");
    lawyer = await addMember(A.org.id, "LAWYER", "box-law");
    const secret = await db.case.create({ data: { organizationId: A.org.id, title: "Sigiloso Box", confidential: true } });
    await notice(A.org.id, "Aberta 1");
    await notice(A.org.id, "Aberta 2", { receivedAt: new Date(Date.now() - 5 * 86_400_000) });
    await notice(A.org.id, "Do sigiloso", { caseId: secret.id });
    await notice(B.org.id, "Outro escritório");
    await db.certificate.create({ data: { organizationId: A.org.id, ownerUserId: A.ctx.userId, label: "Vence logo", subjectCn: "ADV", serialNumber: "1", fingerprintSha256: `fp-box-${A.org.id}`, notBefore: new Date(Date.now() - 86_400_000), notAfter: new Date(Date.now() + 10 * 86_400_000), pfxEnc: "x", passEnc: "x" } });
  });

  it("dono vê os blocos do módulo; números vêm do banco do próprio escritório", async () => {
    const d = await getBoxDashboard(A.ctx);
    expect(d.notices).not.toBeNull();
    expect(d.notices!.boxes.entrada).toBeGreaterThanOrEqual(2);
    expect(d.notices!.stale).toBeGreaterThanOrEqual(1);
    expect(d.notices!.byDay).toHaveLength(14);
    expect(d.integrations).not.toBeNull();
    expect(d.captures).not.toBeNull();
    expect(d.certificates!.expiring.map((c) => c.label)).toContain("Vence logo");
    expect(d.certificates!.expiring.find((c) => c.label === "Vence logo")!.daysLeft).toBeLessThanOrEqual(10);
    const dB = await getBoxDashboard(B.ctx);
    expect(dB.notices!.boxes.entrada).toBe(1);
  });

  it("perfil sem permissão não recebe o bloco (null)", async () => {
    const d = await getBoxDashboard(finance.ctx);
    expect(d.integrations).toBeNull();
    expect(d.captures).toBeNull();
    expect(d.certificates).toBeNull();
  });

  it("não apresenta histórico importado como captura e mantém totais, fuso e sigilo", async () => {
    const C = await makeOrgWithOwner("box-activity-C");
    const D = await makeOrgWithOwner("box-activity-D");
    const member = await addMember(C.org.id, "LAWYER", "box-activity-law");
    const now = new Date("2026-10-23T02:00:00Z");
    const secret = await db.case.create({ data: { organizationId: C.org.id, title: "Captura restrita", confidential: true } });
    const stamp = { source: "IMPORTED", createdAt: new Date("2026-10-23T01:00:00Z") };
    await notice(C.org.id, "Histórico antigo importado hoje", { ...stamp, receivedAt: new Date("2023-01-01") });
    await notice(C.org.id, "Captura DJEN", { ...stamp, externalKey: "djen:box-regression" });
    await notice(C.org.id, "Captura sigilosa", { ...stamp, externalKey: "mni:box-regression", caseId: secret.id });
    await notice(C.org.id, "Fora do período", { ...stamp, createdAt: new Date("2026-10-16T02:59:59Z") });
    await notice(D.org.id, "Captura de outro escritório", { ...stamp, externalKey: "djen:box-other" });
    const activity = await getNoticeActivity(C.ctx, 7, now);
    const visible = await getNoticeActivity(member.ctx, 7, now);
    expect(activity.bySource.captured - visible.bySource.captured).toBe(1);
    expect(activity.bySource.otherImports).toBe(1);
    expect(activity.byDay.at(-1)?.day).toBe("2026-10-22");
    expect(activity.total).toBe(activity.bySource.captured + activity.bySource.otherImports + activity.bySource.manual);
    expect(visible.bySource.captured).toBe(1);
    expect((await getNoticeActivity(D.ctx, 7, now)).bySource.captured).toBe(1);
  });

  it("sigilo: advogado sem vínculo não vê a intimação do processo sigiloso na contagem nem no painel", async () => {
    const owner = await getBoxDashboard(A.ctx);
    const law = await getBoxDashboard(lawyer.ctx);
    expect(law.notices).not.toBeNull();
    expect(law.notices!.boxes.entrada).toBe(owner.notices!.boxes.entrada - 1);
    expect(await countNewNotices(lawyer.ctx)).toBe(law.notices!.boxes.entrada);
    expect(await countNewNotices(A.ctx)).toBe(owner.notices!.boxes.entrada);
  });
});
