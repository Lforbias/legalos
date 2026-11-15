import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { createCase } from "@/server/services/case.service";
import { createMonitor, syncDjen } from "@/server/services/djen.service";
import { linkPublicDjenNoticeToCase, listPublicDjenNotices, listPublicDjenNoticesForCase } from "@/server/services/public-judicial.service";
import { djenItem, djenPage } from "../fixtures/djen-samples";
import { addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TRT5", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const cnj = (sequence: string) => `${sequence}-${computeCnjCheck({ sequence, year: "2024", segment: "5", court: "05", origin: "0001" })}.2024.5.05.0001`;

describe("Central Judicial pública — DJEN por OAB", () => {
  let office: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let monitorId = "";
  let noticeId = "";

  beforeAll(async () => {
    office = await makeOrgWithOwner("public-judicial");
    lawyer = await addMember(office.org.id, "LAWYER", "public-judicial-lawyer");
  });

  afterAll(async () => {
    if (office) {
      await db.courtNotice.deleteMany({ where: { organizationId: office.org.id } });
      await db.djenMonitor.deleteMany({ where: { organizationId: office.org.id } });
      await db.case.deleteMany({ where: { organizationId: office.org.id } });
    }
  });

  it("permite ao advogado cadastrar a OAB, consultar DJEN e ligar a publicação a um processo", async () => {
    const monitor = await createMonitor(lawyer.ctx, { label: "Dra. Teste Público", oabNumber: "98765", oabUf: "SP" });
    monitorId = monitor.id;

    await syncDjen(lawyer.ctx, monitor.id, {
      http: async () => ({ status: 200, body: djenPage([djenItem({ id: 9876501, numero_processo: "" })]) }),
      pauseMs: 0,
    });

    const feed = await listPublicDjenNotices(lawyer.ctx);
    expect(feed.total).toBe(1);
    expect(feed.items[0]).toMatchObject({ title: expect.any(String), content: expect.stringContaining("intimada") });
    noticeId = feed.items[0]!.id;

    const caseRow = await createCase(office.ctx, { ...caseBase, title: "Processo para vincular", number: cnj("0098765") });
    await linkPublicDjenNoticeToCase(lawyer.ctx, noticeId, caseRow.id);
    const caseNotices = await listPublicDjenNoticesForCase(lawyer.ctx, caseRow.id);
    expect(caseNotices).toHaveLength(1);
    expect(caseNotices[0]!.id).toBe(noticeId);
  });

  it("não disponibiliza publicações de outro escritório", async () => {
    if (!monitorId) return;
    const other = await makeOrgWithOwner("public-judicial-other");
    try {
      expect((await listPublicDjenNotices(other.ctx)).total).toBe(0);
    } finally {
      await db.courtNotice.deleteMany({ where: { organizationId: other.org.id } });
      await db.djenMonitor.deleteMany({ where: { organizationId: other.org.id } });
      await db.organization.deleteMany({ where: { id: other.org.id } });
    }
  });
});
