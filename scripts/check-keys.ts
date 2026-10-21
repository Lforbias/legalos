import "./load-env";
import { db } from "../src/lib/db/client";
import { certKey, openBytes } from "../src/lib/security/pfx";
import { decryptSecret, mfaKey } from "../src/lib/security/totp";

/**
 * Uso: npm run check-keys
 * Confere se as chaves atuais (MFA_ENCRYPTION_KEY, CERT_ENCRYPTION_KEY) abrem o que já foi gravado no banco.
 * Nunca imprime segredo: só quem (e-mail/rótulo) e se abre ou não.
 */
(async () => {
  let bad = 0;
  const mk = mfaKey();
  const ck = certKey();
  console.log(`MFA_ENCRYPTION_KEY: ${mk ? "válida" : "AUSENTE ou inválida"}  |  CERT_ENCRYPTION_KEY: ${ck ? "válida" : "AUSENTE ou inválida"}\n`);

  const mfa = await db.userMfa.findMany({ include: { user: { select: { email: true } } } });
  for (const m of mfa) {
    let ok = false;
    try { ok = !!mk && !!decryptSecret(m.secretEnc, mk); } catch { ok = false; }
    if (!ok) bad++;
    console.log(`${ok ? "OK    " : "FALHA "} 2FA${m.enabledAt ? "" : " (pendente)"}   ${m.user.email}`);
  }
  const certs = await db.certificate.findMany({ where: { revokedAt: null }, select: { label: true, pfxEnc: true, passEnc: true, subjectCn: true } });
  for (const c of certs) {
    let ok = false;
    try { ok = !!ck && !!openBytes(c.pfxEnc, ck) && !!openBytes(c.passEnc, ck); } catch { ok = false; }
    if (!ok) bad++;
    console.log(`${ok ? "OK    " : "FALHA "} certificado  ${c.label}`);
  }
  const conns = await db.courtConnection.findMany({ select: { label: true, secretEnc: true } });
  for (const c of conns) {
    let ok = false;
    try { ok = !!ck && !!decryptSecret(c.secretEnc, ck); } catch { ok = false; }
    if (!ok) bad++;
    console.log(`${ok ? "OK    " : "FALHA "} conexão MNI   ${c.label}`);
  }
  if (!mfa.length && !certs.length && !conns.length) console.log("Nada cifrado no banco ainda.");
  console.log(bad ? `\n${bad} item(ns) não abrem com as chaves atuais: foram gravados com outra chave. Veja docs/producao.md (seção "Chave trocada").` : "\nTudo abre com as chaves atuais.");
  await db.$disconnect();
  process.exit(bad ? 2 : 0);
})();
