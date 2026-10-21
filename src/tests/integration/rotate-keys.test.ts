import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { openBytes, sealBytes } from "@/lib/security/pfx";
import { rotateKeys } from "@/lib/security/rotate-keys";
import { decryptSecret, encryptSecret } from "@/lib/security/totp";
import { makeOrgWithOwner } from "./helpers";

const k = () => crypto.randomBytes(32);

describe("troca de chaves de cifra (rotate-keys)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  const oldMfa = k(), newMfa = k(), oldCert = k(), newCert = k();
  let hookId = "";
  let certId = "";
  let connId = "";

  beforeAll(async () => {
    // A troca de chaves é global (todos os segredos do banco). Limpa segredos deixados por outros testes, cifrados com outras chaves.
    await db.webhookEndpoint.deleteMany({});
    await db.userMfa.deleteMany({});
    await db.courtConnection.deleteMany({});
    await db.certificate.deleteMany({});
    A = await makeOrgWithOwner("rot");
    await db.userMfa.create({ data: { userId: A.owner.id, secretEnc: encryptSecret("SEGREDO2FA", oldMfa), enabledAt: new Date() } as never });
    hookId = (await db.webhookEndpoint.create({ data: { organizationId: A.org.id, name: "h", url: "https://example.test/h", secretEnc: encryptSecret("segredo-webhook", oldMfa), events: ["x"] } as never })).id;
    certId = (await db.certificate.create({ data: { organizationId: A.org.id, ownerUserId: A.owner.id, label: "c", subjectCn: "x", serialNumber: "1", fingerprintSha256: `fp-rot-${A.org.id}`, notBefore: new Date(Date.now() - 1000), notAfter: new Date(Date.now() + 86_400_000), pfxEnc: sealBytes(Buffer.from("PFX-BYTES"), oldCert), passEnc: sealBytes(Buffer.from("senha"), oldCert) } })).id;
    connId = (await db.courtConnection.create({ data: { organizationId: A.org.id, label: "c", jtr: "5.05", endpointUrl: "https://x.test", authMode: "PASSWORD", secretEnc: sealBytes(Buffer.from('{"document":"1","password":"p"}'), oldCert) } })).id;
  });

  it("simulação não grava nada", async () => {
    const before = await db.certificate.findUniqueOrThrow({ where: { id: certId } });
    const r = await rotateKeys(db, { mfa: { old: oldMfa, next: newMfa }, cert: { old: oldCert, next: newCert } }, { apply: false });
    expect(r.applied).toBe(false);
    expect(r.mfa!.userMfa).toBeGreaterThanOrEqual(1);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: certId } })).pfxEnc).toBe(before.pfxEnc);
  });

  it("chave antiga errada: nada é alterado (tudo ou nada)", async () => {
    const before = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: hookId } });
    await expect(rotateKeys(db, { mfa: { old: k(), next: newMfa } }, { apply: true })).rejects.toThrow(/Nada foi alterado/);
    expect((await db.webhookEndpoint.findUniqueOrThrow({ where: { id: hookId } })).secretEnc).toBe(before.secretEnc);
  });

  it("aplica: tudo passa a abrir só com as chaves novas e o conteúdo é o mesmo", async () => {
    const r = await rotateKeys(db, { mfa: { old: oldMfa, next: newMfa }, cert: { old: oldCert, next: newCert } }, { apply: true });
    expect(r.applied).toBe(true);
    const mfa = await db.userMfa.findUniqueOrThrow({ where: { userId: A.owner.id } });
    expect(decryptSecret(mfa.secretEnc, newMfa)).toBe("SEGREDO2FA");
    expect(() => decryptSecret(mfa.secretEnc, oldMfa)).toThrow();
    expect(decryptSecret((await db.webhookEndpoint.findUniqueOrThrow({ where: { id: hookId } })).secretEnc, newMfa)).toBe("segredo-webhook");
    const c = await db.certificate.findUniqueOrThrow({ where: { id: certId } });
    expect(openBytes(c.pfxEnc, newCert).toString()).toBe("PFX-BYTES");
    expect(openBytes(c.passEnc, newCert).toString()).toBe("senha");
    expect(openBytes((await db.courtConnection.findUniqueOrThrow({ where: { id: connId } })).secretEnc, newCert).toString()).toContain('"password":"p"');
  });
});
