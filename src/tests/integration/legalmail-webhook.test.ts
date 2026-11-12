import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { createCase } from "@/server/services/case.service";
import { POST } from "@/app/api/webhooks/legalmail/route";
import { createTask } from "@/server/services/task.service";
import { listCaseNoticesForFunc, resolveSourceNotice } from "@/server/services/notice.service";
import { makeOrgWithOwner } from "./helpers";

vi.unmock("@/lib/box-retirement");
afterEach(() => vi.unstubAllEnvs());

async function createWebhookKey(office: Awaited<ReturnType<typeof makeOrgWithOwner>>) {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  await db.apiKey.create({ data: { organizationId: office.org.id, name: "LegalMail test", prefix, keyHash: createHash("sha256").update(secret).digest("hex"), scopes: ["legalmail:ingest"], createdById: office.owner.id } });
  return `lgos_${prefix}_${secret}`;
}

const cnj = (seq: string) => `${seq}-${computeCnjCheck({ sequence: seq, year: "2024", segment: "8", court: "26", origin: "0100" })}.2024.8.26.0100`;
const caseBase = { number: "", legacyNumber: "", title: "LegalMail webhook case", area: "", court: "TJSP", courtUnit: "", courtState: "SP", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };

describe("LegalMail inbound webhook", () => {
  it("links a text movement to the unique CNJ process and deduplicates retries", async () => {
    const office = await makeOrgWithOwner("legalmail-hook");
    const caseNumber = cnj("0009001");
    const caseRow = await createCase(office.ctx, { ...caseBase, number: caseNumber });
    const token = await createWebhookKey(office);
    const otherOffice = await makeOrgWithOwner("legalmail-other");
    const otherToken = await createWebhookKey(otherOffice);
    vi.stubEnv("LEGALMAIL_ORGANIZATION_ID", office.org.id);
    const payload = { clientkey: token, params: [{ numero_processo: caseNumber, tribunal: "TJSP", documento: [{ tipo: "text", title: "Intimação", text: "Manifestar-se sobre os documentos juntados no prazo legal.", idmovimentacoes: 987654321, movement_date: "2026-11-10", "intimation_date ": "2026-11-10" }] }] };

    const send = (clientkey: string) => POST(new Request("https://legalos.test/api/webhooks/legalmail", {
      method: "POST",
      body: JSON.stringify({ ...payload, clientkey }),
    }));

    expect((await send(otherToken)).status).toBe(401);
    const first = await send(token);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ imported: 1, duplicates: 0 });
    const saved = await db.courtNotice.findFirst({ where: { organizationId: office.org.id, externalKey: "legalmail:987654321" } });
    expect(saved?.caseId).toBe(caseRow.id);
    expect(saved?.sourceSystem).toBe("LEGALMAIL");

    expect(await listCaseNoticesForFunc(office.ctx, caseRow.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: saved?.id })]),
    );
    expect(saved).not.toBeNull();
    const source = await resolveSourceNotice(office.ctx, saved!.id, "func");
    const task = await createTask(office.ctx, {
      title: "Conferir comunicação", description: "", caseId: caseRow.id,
      status: "TODO", priority: "NORMAL", assigneeId: "", clientId: "", dueDate: "",
    }, { sourceNoticeId: source?.id, surface: "func" });
    expect(task.sourceNoticeId).toBe(saved?.id);

    const retry = await send(token);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ imported: 0, duplicates: 1 });
    vi.stubEnv("LEGALMAIL_ORGANIZATION_ID", "");
    expect((await send(token)).status).toBe(401);
  });
});
