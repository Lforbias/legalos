import forge from "node-forge";

let cached: forge.pki.rsa.KeyPair | null = null;

/** Gera um .pfx A1 SINTÉTICO (autoassinado) só para testes. Nunca use certificados reais em testes. */
export function makeTestPfx(opts: { password: string; cn?: string; notBefore?: Date; notAfter?: Date; serial?: string; withKey?: boolean }): Buffer {
  cached ??= forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const keys = cached;
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = opts.serial ?? Math.floor(Math.random() * 1e12).toString(16).padStart(8, "0");
  cert.validity.notBefore = opts.notBefore ?? new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = opts.notAfter ?? new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [{ name: "commonName", value: opts.cn ?? "ADVOGADA TESTE:12345678909" }];
  cert.setSubject(attrs);
  cert.setIssuer([{ name: "commonName", value: "AC TESTE SINTETICA" }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(opts.withKey === false ? null : keys.privateKey, [cert], opts.password, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}
