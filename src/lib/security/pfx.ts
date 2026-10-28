import forge from "node-forge";
import { ValidationError } from "@/lib/permissions/check";
import { decryptSecret, encryptSecret } from "./totp";

export type PfxInfo = {
  subjectCn: string;
  issuerCn: string | null;
  serialNumber: string;
  fingerprintSha256: string;
  notBefore: Date;
  notAfter: Date;
  documentHint: string | null;
};

/** Chave (32 bytes, base64) que cifra os certificados no banco. Separada da chave do MFA. */
export function certKey(): Buffer | null {
  const raw = process.env.CERT_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

const maskDoc = (digits: string) => (digits.length === 11 ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**` : `**.${digits.slice(2, 5)}.${digits.slice(5, 8)}/****-**`);

/** Lê um .pfx/.p12 (A1), confere senha, chave privada e correspondência chave↔certificado. Nunca devolve a chave privada. */
export function parsePfx(buf: Buffer, password: string): PfxInfo {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(buf.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch {
    throw new ValidationError("Não foi possível abrir o certificado: arquivo inválido ou senha incorreta.", { password: ["Senha incorreta ou arquivo inválido."] });
  }
  const CERT_OID = forge.pki.oids["certBag"] as string;
  const SHROUDED_OID = forge.pki.oids["pkcs8ShroudedKeyBag"] as string;
  const KEY_OID = forge.pki.oids["keyBag"] as string;
  const certs = (p12.getBags({ bagType: CERT_OID })[CERT_OID] ?? []).map((bag) => bag.cert).filter((c): c is forge.pki.Certificate => Boolean(c));
  const keyBags = [...(p12.getBags({ bagType: SHROUDED_OID })[SHROUDED_OID] ?? []), ...(p12.getBags({ bagType: KEY_OID })[KEY_OID] ?? [])];
  const keys = keyBags.map((bag) => bag.key).filter((k): k is forge.pki.rsa.PrivateKey => Boolean(k));
  if (!keys.length) throw new ValidationError("O arquivo não contém chave privada: envie o certificado A1 completo (.pfx/.p12).", { file: ["Sem chave privada."] });
  const cert = certs.find((c) => keys.some((k) => (c.publicKey as forge.pki.rsa.PublicKey).n?.compareTo(k.n) === 0));
  if (!cert) throw new ValidationError("Nenhum certificado do arquivo corresponde à chave privada.", { file: ["Certificado e chave não correspondem."] });

  const cn = String(cert.subject.getField("CN")?.value ?? "").trim();
  if (!cn) throw new ValidationError("Certificado sem nome (CN) no titular.", { file: ["Certificado sem CN."] });
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fp = forge.md.sha256.create().update(der).digest().toHex();
  const docMatch = /:(\d{14}|\d{11})\b/.exec(cn);
  return {
    subjectCn: cn.slice(0, 200),
    issuerCn: (cert.issuer.getField("CN")?.value as string | undefined)?.slice(0, 200) ?? null,
    serialNumber: cert.serialNumber,
    fingerprintSha256: fp,
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    documentHint: docMatch?.[1] ? maskDoc(docMatch[1]) : null,
  };
}

/** Re-encodes a supported A1 in memory for OpenSSL 3; never overwrites the encrypted original. */
export function pfxForTls(buf: Buffer, password: string): Buffer {
  parsePfx(buf, password); // Same key/certificate validation used at upload.
  try {
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(buf.toString("binary"))), false, password);
    const certOid = forge.pki.oids.certBag!;
    const keyOid = forge.pki.oids.keyBag!;
    const shroudedOid = forge.pki.oids.pkcs8ShroudedKeyBag!;
    const certs = (p12.getBags({ bagType: certOid })[certOid] ?? []).map(b => b.cert).filter((c): c is forge.pki.Certificate => Boolean(c));
    const keys = [...(p12.getBags({ bagType: keyOid })[keyOid] ?? []), ...(p12.getBags({ bagType: shroudedOid })[shroudedOid] ?? [])].map(b => b.key).filter((k): k is forge.pki.rsa.PrivateKey => Boolean(k));
    const key = keys.find(k => certs.some(c => (c.publicKey as forge.pki.rsa.PublicKey).n?.compareTo(k.n) === 0));
    const leaf = key && certs.find(c => (c.publicKey as forge.pki.rsa.PublicKey).n?.compareTo(key.n) === 0);
    if (!key || !leaf) throw new Error("Certificado e chave não correspondem.");
    const chain = [leaf, ...certs.filter(c => c !== leaf)];
    const normalized = forge.pkcs12.toPkcs12Asn1(key, chain, password, { algorithm: "aes256", count: 10000, saltSize: 16, generateLocalKeyId: true });
    return Buffer.from(forge.asn1.toDer(normalized).getBytes(), "binary");
  } catch {
    throw new ValidationError("Não foi possível preparar o certificado A1 para a conexão TLS. Confira a exportação do arquivo e a senha.");
  }
}

export const sealBytes = (data: Buffer, key: Buffer) => encryptSecret(data.toString("base64"), key);
export const openBytes = (sealed: string, key: Buffer) => Buffer.from(decryptSecret(sealed, key), "base64");
