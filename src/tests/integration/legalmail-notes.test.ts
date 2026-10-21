import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { getObjectStream } from "@/lib/storage/local-storage";
import { createCase } from "@/server/services/case.service";
import {
  addBulkNote, addCaseNoteItem, addNoteAttachment, deleteCaseNote, deleteNoteAttachment, getNoteAttachmentForDownload, listCaseNotes, listNoteHistory, NOTE_MAX_ATTACHMENTS, setNotePinned, updateCaseNote,
} from "@/server/services/case-note.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const base = { legacyNumber: "", number: "", title: "Caso", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const pdf = (tag: string) => ({ name: `${tag}.pdf`, buffer: Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`) });

describe("notas do processo — anexos, edição e histórico", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let c1: { id: string };
  let c2: { id: string };
  let secret: { id: string };

  beforeAll(async () => {
    A = await makeOrgWithOwner("nt-a");
    B = await makeOrgWithOwner("nt-b");
    lawyer = await addMember(A.org.id, "LAWYER", "nt-adv");
    assistant = await addMember(A.org.id, "ASSISTANT", "nt-ass");
    c1 = await createCase(lawyer.ctx, { ...base, title: "Caso 1" });
    c2 = await createCase(lawyer.ctx, { ...base, title: "Caso 2" });
    secret = await createCase(A.ctx, { ...base, title: "Sigiloso", confidential: true });
  });

  it("criar, editar (texto anterior guardado), fixar e histórico; edição sem mudança não gera registro", async () => {
    const note = await addCaseNoteItem(lawyer.ctx, c1.id, { title: "Primeira", body: "Texto original", pinned: false });
    await updateCaseNote(lawyer.ctx, note.id, { title: "Primeira", body: "Texto original" }); // igual: nada
    await updateCaseNote(lawyer.ctx, note.id, { title: "Primeira", body: "Texto corrigido" });
    await updateCaseNote(lawyer.ctx, note.id, { title: "Novo título", body: "Texto corrigido" });
    await setNotePinned(lawyer.ctx, note.id, true);
    await setNotePinned(lawyer.ctx, note.id, false);
    const h = await listNoteHistory(lawyer.ctx, c1.id);
    expect(h.map((e) => e.kind).reverse()).toEqual(["created", "edited", "edited", "pinned", "unpinned"]);
    const edited = h.filter((e) => e.kind === "edited").reverse();
    expect(edited[0]!.previous).toContain("Texto original");
    expect(edited[0]!.detail).toBe("Nota editada");
    expect(edited[1]!.detail).toBe("Título alterado");
    expect(h[0]!.userName).toBeTruthy();
    const [row] = await listCaseNotes(lawyer.ctx, c1.id);
    expect(row).toMatchObject({ title: "Novo título", body: "Texto corrigido" });
    await expect(updateCaseNote(lawyer.ctx, note.id, { title: "x", body: "a" })).rejects.toThrow(); // texto curto demais
  });

  it("permissões e isolamento: leitor não edita; outro escritório e processo sigiloso não enxergam", async () => {
    const note = (await listCaseNotes(lawyer.ctx, c1.id))[0]!;
    await expect(updateCaseNote(assistant.ctx, note.id, { body: "tentativa" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addNoteAttachment(assistant.ctx, note.id, pdf("x"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateCaseNote(B.ctx, note.id, { body: "invasão" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listNoteHistory(B.ctx, c1.id)).rejects.toBeInstanceOf(NotFoundError);
    const s = await addCaseNoteItem(A.ctx, secret.id, { title: "", body: "Nota sigilosa", pinned: false });
    await expect(updateCaseNote(lawyer.ctx, s.id, { body: "Mexendo no sigilo" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listNoteHistory(lawyer.ctx, secret.id)).rejects.toBeInstanceOf(NotFoundError);
    const att = await (async () => { await addNoteAttachment(A.ctx, s.id, pdf("sigilo")); return db.caseNoteAttachment.findFirstOrThrow({ where: { noteId: s.id } }); })();
    await expect(getNoteAttachmentForDownload(lawyer.ctx, att.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getNoteAttachmentForDownload(B.ctx, att.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getNoteAttachmentForDownload(A.ctx, att.id)).resolves.toMatchObject({ id: att.id });
  });

  it("anexos: adiciona, lista, baixa, limita a 10, remove (some da lista) e tudo vai para o histórico", async () => {
    const note = (await listCaseNotes(lawyer.ctx, c1.id))[0]!;
    await addNoteAttachment(lawyer.ctx, note.id, pdf("laudo"));
    let n = (await listCaseNotes(lawyer.ctx, c1.id))[0]!;
    expect(n.attachments.map((a) => a.name)).toEqual(["laudo.pdf"]);
    const dl = await getNoteAttachmentForDownload(lawyer.ctx, n.attachments[0]!.id);
    expect(dl.mimeType).toBe("application/pdf");
    await deleteNoteAttachment(lawyer.ctx, n.attachments[0]!.id);
    n = (await listCaseNotes(lawyer.ctx, c1.id))[0]!;
    expect(n.attachments).toHaveLength(0);
    await expect(getNoteAttachmentForDownload(lawyer.ctx, dl.id)).rejects.toBeInstanceOf(NotFoundError);
    for (let i = 0; i < NOTE_MAX_ATTACHMENTS; i++) await addNoteAttachment(lawyer.ctx, note.id, pdf(`a${i}`));
    await expect(addNoteAttachment(lawyer.ctx, note.id, pdf("excedente"))).rejects.toBeInstanceOf(ValidationError);
    const kinds = (await listNoteHistory(lawyer.ctx, c1.id)).map((e) => e.kind);
    expect(kinds).toContain("attachment_added");
    expect(kinds).toContain("attachment_removed");
  });

  it("excluir a nota apaga os arquivos e deixa o registro (com o texto) no histórico", async () => {
    const note = await addCaseNoteItem(lawyer.ctx, c2.id, { title: "Descartável", body: "Conteúdo que será excluído", pinned: false });
    await addNoteAttachment(lawyer.ctx, note.id, pdf("temp"));
    const att = await db.caseNoteAttachment.findFirstOrThrow({ where: { noteId: note.id } });
    await expect(getObjectStream(att.storageKey)).resolves.toBeDefined();
    await deleteCaseNote(lawyer.ctx, note.id);
    await expect(getObjectStream(att.storageKey)).rejects.toThrow();
    expect(await db.caseNoteAttachment.count({ where: { noteId: note.id } })).toBe(0);
    const del = (await listNoteHistory(lawyer.ctx, c2.id)).find((e) => e.kind === "deleted")!;
    expect(del.previous).toBe("Conteúdo que será excluído");
  });

  it("nota em lote registra a criação em cada processo", async () => {
    await addBulkNote(lawyer.ctx, { title: "Lote", body: "Aviso para todos", pinned: true, caseIds: [c1.id, c2.id] });
    for (const id of [c1.id, c2.id]) {
      const e = (await listNoteHistory(lawyer.ctx, id)).find((x) => x.detail.includes("em lote"));
      expect(e?.kind).toBe("created");
    }
  });
});
