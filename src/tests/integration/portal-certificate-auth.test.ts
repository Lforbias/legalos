import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { openBytes } from "@/lib/security/pfx";
import { totpCode, totpStep } from "@/lib/security/totp";
import { connectEprocTjmg, connectPje } from "@/server/services/portal-access.service";
import { getCertificateMaterial, listUsableCertificates, uploadCertificate } from "@/server/services/certificate.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { makeTestPfx } from "../fixtures/make-pfx";
import { META, makeOrgWithOwner } from "./helpers";

describe("login TJMG com certificado + autenticador", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let certificateId: string;
  let authenticatorSecret: string;
  const filePassword = "senha-pfx-fixture";

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.EVOLUTION_PJE_LOGIN_ENABLED = "1";
    a = await makeOrgWithOwner("portal-cert-auth");
    const enrollment = await startEnrollment(a.owner.id, a.owner.email);
    authenticatorSecret = enrollment.secret;
    await confirmEnrollment(a.owner.id, totpCode(authenticatorSecret, totpStep()), META);
    certificateId = (await uploadCertificate(a.ctx, {
      file: makeTestPfx({ password: filePassword, cn: "ADV TESTE:12345678909", serial: "ac123456" }),
      password: filePassword,
      label: "A1 para login TJMG",
      ownerUserId: a.owner.id,
    }, "portal")).id;
  });

  it("lista certificado próprio e abre o material apenas para login de portal", async () => {
    expect(await listUsableCertificates(a.ctx, "portal")).toContainEqual({ id: certificateId, label: "A1 para login TJMG" });
    const material = await getCertificateMaterial(a.ctx, certificateId, "portal:login", null, "portal");
    expect(material.passphrase).toBe(filePassword);
    expect(material.pfx.length).toBeGreaterThan(0);
    expect(await db.certificateUsage.count({ where: { certificateId, purpose: "portal:login" } })).toBe(1);
  });

  it("grava PJe apenas com certificado e rejeita chave TOTP ausente", async () => {
    await expect(connectPje(a.ctx, { targets: ["tjmg-1g"], certificateId }, "evolution")).rejects.toThrow(/chave do autenticador/i);
    const result = await connectPje(a.ctx, { targets: ["tjmg-1g"], certificateId, otp: authenticatorSecret }, "evolution");
    const row = await db.portalAccess.findUniqueOrThrow({ where: { id: result.ids[0]! } });
    const key = Buffer.from(process.env.CERT_ENCRYPTION_KEY!, "base64");
    const secret = JSON.parse(openBytes(row.secretEnc, key).toString("utf8")) as { document: string; password: string; otpSecret: string };
    expect(row.authMethod).toBe("CERTIFICATE");
    expect(row.certificateId).toBe(certificateId);
    expect(secret).toEqual({ document: "", password: "", otpSecret: authenticatorSecret });
  });

  it("grava eproc apenas com certificado e exige a chave TOTP", async () => {
    await expect(connectEprocTjmg(a.ctx, { certificateId })).rejects.toThrow(/chave do autenticador/i);
    const result = await connectEprocTjmg(a.ctx, { certificateId, otp: authenticatorSecret });
    const row = await db.portalAccess.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.authMethod).toBe("CERTIFICATE");
    expect(row.certificateId).toBe(certificateId);
  });
});
