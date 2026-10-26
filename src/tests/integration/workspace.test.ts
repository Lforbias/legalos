import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { getClientWorkspace, listWorkspaceFolders } from "@/server/services/workspace.service";
import { makeOrgWithOwner } from "./helpers";

describe("Client workspace", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let b: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let clientId: string;
  let caseId: string;
  let secretId: string;
  beforeAll(async () => {
    a = await makeOrgWithOwner("desktop-a"); b = await makeOrgWithOwner("desktop-b");
    const client = await db.client.create({ data: { organizationId: a.org.id, type: "PERSON", name: "Desktop Client", document: "52998224725", notes: "Administrative notes" } }); clientId = client.id;
    const process = (title: string, confidential = false) => db.case.create({ data: { organizationId: a.org.id, title, confidential, parties: { create: { organizationId: a.org.id, clientId, name: client.name, role: "PLAINTIFF", isOurClient: true } } } });
    caseId = (await process("First case")).id;
    await process("Second consultative case"); secretId = (await process("Secret case", true)).id;
    await db.task.createMany({ data: [
      { organizationId: a.org.id, title: "Direct task", clientId },
      { organizationId: a.org.id, title: "Case task", caseId },
      { organizationId: a.org.id, title: "Both links", caseId, clientId },
      { organizationId: a.org.id, title: "Restricted task", caseId: secretId, clientId },
    ] });
    for (const [n, processId] of [["Visible file", caseId], ["Secret file", secretId]] as const) await db.document.create({ data: { organizationId: a.org.id, name: n, caseId: processId, mimeType: "application/pdf", sizeBytes: 1, sha256: "test", storageKey: `desktop-${processId}` } });
    for (const [description, processId] of [["Visible receivable", caseId], ["Secret receivable", secretId]] as const) await db.financeEntry.create({ data: { organizationId: a.org.id, description, caseId: processId, clientId, kind: "RECEIVABLE", amount: "120.00", paidAmount: "20.00", status: "PARTIAL", issueDate: new Date(), dueDate: new Date() } });
    await db.caseEvent.create({ data: { organizationId: a.org.id, caseId, source: "INTERNAL", kind: "NOTE", title: "Visible movement" } });
    const account = await db.whatsappAccount.create({ data: { organizationId: a.org.id, label: "Fixture", phoneNumberId: "desktop-fixture", tokenEnc: "fixture" } });
    await db.whatsappConversation.createMany({ data: [
      { organizationId: a.org.id, accountId: account.id, waId: "551100000001", caseId, lastMessageAt: new Date() },
      { organizationId: a.org.id, accountId: account.id, waId: "551100000002", caseId: secretId, clientId, lastMessageAt: new Date() },
    ] });
    await db.courtNotice.create({ data: { organizationId: a.org.id, caseId, title: "Visible notice", content: "Fixture", contentHash: "desktop-notice", receivedAt: new Date() } });
  });
  it("lists only this office's client folders and includes multiple cases", async () => {
    await db.client.create({ data: { organizationId: b.org.id, name: "Other office", type: "PERSON" } });
    const folders = await listWorkspaceFolders(a.ctx);
    expect(folders.total).toBe(1);
    expect(folders.items[0]).not.toHaveProperty("_count");
    expect((await getClientWorkspace(a.ctx, clientId)).caseCount).toBe(3);
    await expect(getClientWorkspace(b.ctx, clientId)).rejects.toThrow();
  });
  it("aggregates direct and indirect links once and excludes confidential data across every section", async () => {
    const limited = { ...a.ctx, isOwner: false, permissions: new Set(["clients:read", "cases:read", "tasks:read", "documents:read", "finance:read", "whatsapp:read", "inbox:read"] as const) };
    const data = await getClientWorkspace(limited, clientId);
    expect(data.caseCount).toBe(2);
    expect(data.work?.total).toBe(3);
    expect(data.work?.items.filter(x => x.title === "Both links")).toHaveLength(1);
    expect(data.documentCount).toBe(1);
    expect(data.chatCount).toBe(1);
    expect(data.noticeCount).toBe(1);
    expect(data.financeTotals?._sum.amount?.toString()).toBe("120");
    expect(data.financeTotals?._sum.paidAmount?.toString()).toBe("20");
    expect(JSON.stringify(data)).not.toContain("Secret");
    expect(data.recent.some(x => x.title === "Visible movement")).toBe(true);
  });
  it("searches CPF and visible process without exposing confidential process matches", async () => {
    expect((await listWorkspaceFolders(a.ctx, { q: "529.982.247-25" })).total).toBe(1);
    expect((await listWorkspaceFolders(a.ctx, { q: "First case" })).items[0]?.id).toBe(clientId);
    const limited = { ...a.ctx, isOwner: false, permissions: new Set(["clients:read", "cases:read"] as const) };
    expect((await listWorkspaceFolders(limited, { q: "Secret case" })).total).toBe(0);
    const clientsOnly = { ...limited, permissions: new Set(["clients:read"] as const) };
    expect((await listWorkspaceFolders(clientsOnly, { q: "First case" })).total).toBe(0);
    expect((await listWorkspaceFolders(clientsOnly, { q: "Desktop" })).items[0]?.cases).toEqual([]);
  });
  it("omits sections without permission and does not expose counts", async () => {
    const limited = { ...a.ctx, isOwner: false, permissions: new Set(["clients:read"] as const) };
    const data = await getClientWorkspace(limited, clientId);
    expect(data.cases).toBeNull(); expect(data.caseCount).toBeNull();
    expect(data.work).toBeNull(); expect(data.documents).toBeNull(); expect(data.chats).toBeNull();
    expect(data.financeTotals).toBeNull(); expect(data.notices).toBeNull(); expect(data.recent).toEqual([]);
    await expect(listWorkspaceFolders({ ...limited, permissions: new Set() })).rejects.toThrow();
  });
});
