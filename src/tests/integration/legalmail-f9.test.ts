import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { registerPetitioningAdapter, SubmissionUncertainError, type PetitioningAdapter } from "@/lib/petitioning/adapter";
import { totpCode, totpStep } from "@/lib/security/totp";
import { createCase } from "@/server/services/case.service";
import { authorizeCertificateUser, getCertificateMaterial, listAuthorizedUsers, unauthorizeCertificateUser, uploadCertificate } from "@/server/services/certificate.service";
import { uploadDocument } from "@/server/services/document.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { approvePetition, createPetition, requestReview, submitPetition } from "@/server/services/petition.service";
import { createWebhook } from "@/server/services/webhook.service";
import { makeTestPfx } from "../fixtures/make-pfx";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const PASS = "senha-do-certificado";
const KEY = Buffer.alloc(32, 3).toString("base64");
const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`);
const base = { legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };

async function enableMfaFor(userId: string, email: string) {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}

describe("3.0-F9 — certificado com usuários autorizados e webhooks de protocolo", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let owner: Awaited<ReturnType<typeof addMember>>;
  let colleague: Awaited<ReturnType<typeof addMember>>;
  let stranger: Awaited<ReturnType<typeof addMember>>;
  let client: Awaited<ReturnType<typeof addMember>>;
  let certId: string;
  const oldAdapter = process.env.PETITIONING_ADAPTER;

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = KEY;
    A = await makeOrgWithOwner("l3f9-a");
    B = await makeOrgWithOwner("l3f9-b");
    owner = await addMember(A.org.id, "LAWYER", "l3f9-own");
    colleague = await addMember(A.org.id, "LAWYER", "l3f9-col");
    stranger = await addMember(A.org.id, "LAWYER", "l3f9-str");
    client = await addMember(A.org.id, "CLIENT", "l3f9-cli");
    for (const o of [A, B]) {
      const u = await db.user.findUniqueOrThrow({ where: { id: o.ctx.userId } });
      await enableMfaFor(u.id, u.email);
    }
    const c = await uploadCertificate(A.ctx, { file: makeTestPfx({ password: PASS, cn: "ADV F9:12345678909", serial: "f9-serial" }), password: PASS, label: "A1 F9", ownerUserId: owner.ctx.userId });
    certId = c.id;
  });
  afterAll(() => {
    if (oldAdapter === undefined) delete process.env.PETITIONING_ADAPTER; else process.env.PETITIONING_ADAPTER = oldAdapter;
  });

  it("só quem tem o cofre autoriza; titular e cliente não entram; tenant isolado", async () => {
    await expect(authorizeCertificateUser(owner.ctx, certId, colleague.ctx.userId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(authorizeCertificateUser(A.ctx, certId, owner.ctx.userId)).rejects.toThrow(); // titular já tem acesso
    await expect(authorizeCertificateUser(A.ctx, certId, client.ctx.userId)).rejects.toThrow(); // cliente nunca
    await expect(authorizeCertificateUser(A.ctx, certId, B.ctx.userId)).rejects.toThrow(); // membro de outro escritório
    await expect(authorizeCertificateUser(B.ctx, certId, B.ctx.userId)).rejects.toBeInstanceOf(NotFoundError); // certificado de outro escritório
    await authorizeCertificateUser(A.ctx, certId, colleague.ctx.userId);
    await authorizeCertificateUser(A.ctx, certId, colleague.ctx.userId).catch(() => undefined); // idempotente ou recusa, mas nunca duplica
    const list = await listAuthorizedUsers(A.ctx, certId);
    expect(list.filter((x) => x.userId === colleague.ctx.userId)).toHaveLength(1);
    await expect(listAuthorizedUsers(B.ctx, certId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("o material do certificado só sai para titular, administrador do cofre ou usuário autorizado, e cada uso é registrado", async () => {
    await expect(getCertificateMaterial(stranger.ctx, certId, "mni:consultarProcesso")).rejects.toBeInstanceOf(NotFoundError);
    const m1 = await getCertificateMaterial(owner.ctx, certId, "mni:consultarProcesso");
    expect(m1.certificateId).toBe(certId);
    const m2 = await getCertificateMaterial(colleague.ctx, certId, "mni:consultarProcesso");
    expect(m2.subjectCn).toContain("ADV F9");
    const uses = await db.certificateUsage.findMany({ where: { certificateId: certId } });
    expect(uses.map((u) => u.userId)).toEqual(expect.arrayContaining([owner.ctx.userId, colleague.ctx.userId]));
  });

  it("remover a autorização corta o acesso na hora; remover de novo dá não encontrado", async () => {
    await unauthorizeCertificateUser(A.ctx, certId, colleague.ctx.userId);
    await expect(getCertificateMaterial(colleague.ctx, certId, "mni:consultarProcesso")).rejects.toBeInstanceOf(NotFoundError);
    await expect(unauthorizeCertificateUser(A.ctx, certId, colleague.ctx.userId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(unauthorizeCertificateUser(B.ctx, certId, colleague.ctx.userId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(unauthorizeCertificateUser(owner.ctx, certId, colleague.ctx.userId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  describe("webhooks petition.submitted / petition.failed", () => {
    let caseId: string;
    async function approved(title: string) {
      const doc = await uploadDocument(A.ctx, { caseId }, { name: `${title}.pdf`, buffer: pdf(`${title}-${Math.random()}`) });
      const p = await createPetition(owner.ctx, { caseId, documentId: doc.id, title });
      await requestReview(owner.ctx, p.id);
      await approvePetition(A.ctx, p.id);
      return p;
    }
    const events = (type: string) => db.webhookDelivery.findMany({ where: { organizationId: A.org.id, eventType: type }, orderBy: { createdAt: "asc" } });

    beforeAll(async () => {
      caseId = (await createCase(A.ctx, { ...base, number: "", title: "Webhook" })).id;
      await createWebhook(A.ctx, { name: "Protocolos", url: "https://hooks.example.com/protocolos", events: ["petition.submitted", "petition.failed"] });
    });

    it("sucesso emite petition.submitted com protocolo, sem conteúdo do documento", async () => {
      delete process.env.PETITIONING_ADAPTER;
      const p = await approved("Sucesso");
      const r = await submitPetition(A.ctx, p.id);
      const ev = await events("petition.submitted");
      expect(ev).toHaveLength(1);
      const data = (ev[0]!.payload as { data: Record<string, unknown> }).data;
      expect(data).toMatchObject({ petitionId: p.id, caseId, protocol: r.protocol, isDemo: true });
      expect(JSON.stringify(data)).not.toMatch(/%PDF/);
    });

    it("falha do adaptador emite petition.failed; incerteza vem marcada", async () => {
      let mode: "fail" | "uncertain" = "fail";
      const flaky: PetitioningAdapter = {
        key: "f9-flaky", label: "Flaky", isDemo: true,
        async submit() {
          if (mode === "uncertain") throw new SubmissionUncertainError("timeout");
          throw new Error("boom interno com detalhe");
        },
      };
      registerPetitioningAdapter(flaky);
      process.env.PETITIONING_ADAPTER = "f9-flaky";
      const p1 = await approved("Falha");
      await expect(submitPetition(A.ctx, p1.id)).rejects.toBeInstanceOf(ConflictError);
      mode = "uncertain";
      const p2 = await approved("Incerta");
      await expect(submitPetition(A.ctx, p2.id)).rejects.toBeInstanceOf(ConflictError);
      const ev = await events("petition.failed");
      expect(ev).toHaveLength(2);
      const d1 = (ev[0]!.payload as { data: Record<string, unknown> }).data;
      const d2 = (ev[1]!.payload as { data: Record<string, unknown> }).data;
      expect(d1).toMatchObject({ petitionId: p1.id, uncertain: false });
      expect(JSON.stringify(d1)).not.toMatch(/boom interno/); // detalhe interno do erro não vaza
      expect(d2).toMatchObject({ petitionId: p2.id, uncertain: true });
    });

    it("outro escritório não recebe eventos", async () => {
      const other = await db.webhookDelivery.count({ where: { organizationId: B.org.id } });
      expect(other).toBe(0);
    });
  });
});
