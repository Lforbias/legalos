import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { sealBytes } from "@/lib/security/pfx";
import { conversationMeta, deleteField, deleteLabel, listFields, listLabels, saveField, saveLabel, setConversationLabels, setFieldValues } from "@/server/services/chat-meta.service";
import { listConversations } from "@/server/services/whatsapp.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const saved = { ...process.env };

describe("LegalOS Chat — etiquetas e campos personalizados", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let agent: Awaited<ReturnType<typeof addMember>>;
  let c1: string;
  let c2: string;

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    A = await makeOrgWithOwner("meta-a");
    B = await makeOrgWithOwner("meta-b");
    agent = await addMember(A.org.id, "ASSISTANT", "meta-ana");
    const acc = await db.whatsappAccount.create({ data: { organizationId: A.org.id, label: "t", phoneNumberId: "9200", tokenEnc: sealBytes(Buffer.from("x".repeat(30)), Buffer.alloc(32, 7)), createdById: A.owner.id } });
    const mk = (waId: string, name: string) => db.whatsappConversation.create({ data: { organizationId: A.org.id, accountId: acc.id, waId, contactName: name } });
    c1 = (await mk("5571911110001", "Maria")).id;
    c2 = (await mk("5571911110002", "João")).id;
  });
  afterAll(async () => {
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    process.env = { ...saved };
  });

  it("etiquetas: criar, validar, nome único, aplicar, nota na conversa e filtrar a lista", async () => {
    await expect(saveLabel(A.ctx, null, { name: "x", color: "#2563eb" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveLabel(A.ctx, null, { name: "Urgente", color: "vermelho" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveLabel(agent.ctx, null, { name: "Urgente", color: "#dc2626" })).rejects.toBeInstanceOf(ForbiddenError);
    const urg = await saveLabel(A.ctx, null, { name: "Urgente", color: "#dc2626" });
    const prev = await saveLabel(A.ctx, null, { name: "Previdenciário", color: "#2563eb" });
    await expect(saveLabel(A.ctx, null, { name: "urgente", color: "#16a34a" })).rejects.toBeInstanceOf(ValidationError);
    await saveLabel(A.ctx, urg.id, { name: "Urgente!", color: "#ea580c" });
    expect((await listLabels(A.ctx)).map((l) => l.name)).toEqual(["Previdenciário", "Urgente!"]);

    expect(await setConversationLabels(agent.ctx, c1, [urg.id, prev.id])).toEqual({ added: 2, removed: 0 });
    expect(await setConversationLabels(agent.ctx, c1, [urg.id, prev.id])).toEqual({ added: 0, removed: 0 }); // sem mudança, sem nota
    expect(await setConversationLabels(agent.ctx, c1, [prev.id])).toEqual({ added: 0, removed: 1 });
    expect(await db.whatsappMessage.count({ where: { conversationId: c1, direction: "NOTE", body: { startsWith: "Etiquetas:" } } })).toBe(2);
    await setConversationLabels(agent.ctx, c2, [urg.id]);

    const withPrev = await listConversations(A.ctx, "open", undefined, undefined, prev.id);
    expect(withPrev.map((c) => c.id)).toEqual([c1]);
    expect(withPrev[0]!.labels.map((l) => l.label.name)).toEqual(["Previdenciário"]);
    expect((await listConversations(A.ctx, "open", undefined, undefined, urg.id)).map((c) => c.id)).toEqual([c2]);
    expect((await conversationMeta(A.ctx, c1)).labelIds).toEqual([prev.id]);
    expect((await listLabels(A.ctx)).find((l) => l.id === prev.id)!.uses).toBe(1);

    await deleteLabel(A.ctx, urg.id); // sai das conversas, que continuam
    expect((await conversationMeta(A.ctx, c2)).labelIds).toEqual([]);
    expect(await db.whatsappConversation.count({ where: { id: c2 } })).toBe(1);
    await expect(deleteLabel(A.ctx, urg.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("isola escritórios nas etiquetas", async () => {
    const mine = (await listLabels(A.ctx))[0]!;
    expect(await listLabels(B.ctx)).toHaveLength(0);
    await expect(setConversationLabels(B.ctx, c1, [mine.id])).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveLabel(B.ctx, mine.id, { name: "Invasão", color: "#2563eb" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteLabel(B.ctx, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    const other = await saveLabel(B.ctx, null, { name: "De B", color: "#2563eb" });
    await expect(setConversationLabels(A.ctx, c1, [other.id])).rejects.toBeInstanceOf(ValidationError); // etiqueta de outro escritório
  });

  it("campos: tipos validados, valores gravados, limpar apaga, busca acha pelo valor, trocar tipo com valores é barrado", async () => {
    await expect(saveField(agent.ctx, null, { name: "Benefício", kind: "TEXT" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveField(A.ctx, null, { name: "Tipo", kind: "SELECT", options: ["só uma"] })).rejects.toBeInstanceOf(ValidationError);
    const ben = await saveField(A.ctx, null, { name: "Nº do benefício", kind: "TEXT" });
    const val = await saveField(A.ctx, null, { name: "Valor da causa", kind: "NUMBER" });
    const per = await saveField(A.ctx, null, { name: "Data da perícia", kind: "DATE" });
    const tip = await saveField(A.ctx, null, { name: "Tipo de ação", kind: "SELECT", options: ["Aposentadoria", "BPC", "Auxílio-doença", "BPC"] });
    await expect(saveField(A.ctx, null, { name: "nº do benefício", kind: "TEXT" })).rejects.toBeInstanceOf(ValidationError);
    expect((await listFields(A.ctx)).find((f) => f.id === tip.id)!.options).toEqual(["Aposentadoria", "BPC", "Auxílio-doença"]); // sem repetição

    await expect(setFieldValues(agent.ctx, c1, { [val.id]: "abc" })).rejects.toBeInstanceOf(ValidationError);
    await expect(setFieldValues(agent.ctx, c1, { [per.id]: "2026-02-31" })).rejects.toBeInstanceOf(ValidationError);
    await expect(setFieldValues(agent.ctx, c1, { [tip.id]: "Outra" })).rejects.toBeInstanceOf(ValidationError);
    expect(await setFieldValues(agent.ctx, c1, { [ben.id]: "  123.456.789-0 ", [val.id]: "12.500,50", [per.id]: "2026-11-30", [tip.id]: "BPC" })).toEqual({ set: 4, cleared: 0 });
    expect((await conversationMeta(A.ctx, c1)).values).toEqual({ [ben.id]: "123.456.789-0", [val.id]: "12500.5", [per.id]: "2026-11-30", [tip.id]: "BPC" });

    expect((await listConversations(A.ctx, "open", "123.456")).map((c) => c.id)).toEqual([c1]); // busca pelo valor do campo
    expect(await listConversations(A.ctx, "open", "123.456", undefined, undefined)).toHaveLength(1);

    expect(await setFieldValues(agent.ctx, c1, { [ben.id]: "", [tip.id]: null })).toEqual({ set: 0, cleared: 2 });
    expect(Object.keys((await conversationMeta(A.ctx, c1)).values).sort()).toEqual([per.id, val.id].sort());

    await expect(saveField(A.ctx, val.id, { name: "Valor da causa", kind: "TEXT" })).rejects.toBeInstanceOf(ConflictError); // já tem valor
    await saveField(A.ctx, ben.id, { name: "Nº do benefício", kind: "NUMBER" }); // sem valores: pode trocar
    await saveField(A.ctx, per.id, { name: "Data da perícia", kind: "DATE", active: false });
    await expect(setFieldValues(agent.ctx, c1, { [per.id]: "2026-12-01" })).rejects.toBeInstanceOf(ValidationError); // campo desativado
    expect((await listFields(A.ctx, true)).map((f) => f.id)).not.toContain(per.id);

    await deleteField(A.ctx, val.id);
    expect(await db.whatsappFieldValue.count({ where: { fieldId: val.id } })).toBe(0);
    await expect(deleteField(B.ctx, tip.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setFieldValues(B.ctx, c1, { [tip.id]: "BPC" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
