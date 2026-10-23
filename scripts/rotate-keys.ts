import "./load-env";
import { db } from "../src/lib/db/client";
import { rotateKeys, type KeyPair } from "../src/lib/security/rotate-keys";

/**
 * Troca MFA_ENCRYPTION_KEY e/ou CERT_ENCRYPTION_KEY sem perder dados.
 *   Simulação (não grava):  npx tsx scripts/rotate-keys.ts
 *   Gravar:                 npx tsx scripts/rotate-keys.ts --apply
 * A chave ANTIGA é a que está em MFA_ENCRYPTION_KEY / CERT_ENCRYPTION_KEY (ambiente atual).
 * A chave NOVA vem de NEW_MFA_ENCRYPTION_KEY / NEW_CERT_ENCRYPTION_KEY (base64, 32 bytes). Informe uma ou as duas.
 * Depois de gravar: troque as chaves no .env.production e reinicie o app. Guarde as novas fora do servidor.
 */
function pair(oldName: string, newName: string): KeyPair | undefined {
  const next = process.env[newName]?.trim();
  if (!next) return undefined;
  const old = process.env[oldName]?.trim();
  if (!old) throw new Error(`${oldName} (chave atual) não está definida.`);
  const o = Buffer.from(old, "base64");
  const n = Buffer.from(next, "base64");
  if (o.length !== 32) throw new Error(`${oldName} deve ter 32 bytes em base64.`);
  if (n.length !== 32) throw new Error(`${newName} deve ter 32 bytes em base64 (openssl rand -base64 32).`);
  if (o.equals(n)) throw new Error(`${newName} é igual à chave atual.`);
  return { old: o, next: n };
}

(async () => {
  const apply = process.argv.includes("--apply");
  const mfa = pair("MFA_ENCRYPTION_KEY", "NEW_MFA_ENCRYPTION_KEY");
  const cert = pair("CERT_ENCRYPTION_KEY", "NEW_CERT_ENCRYPTION_KEY");
  if (!mfa && !cert) throw new Error("Informe NEW_MFA_ENCRYPTION_KEY e/ou NEW_CERT_ENCRYPTION_KEY.");
  const r = await rotateKeys(db, { mfa, cert }, { apply });
  if (r.mfa) console.log(`2FA: ${r.mfa.userMfa} segredo(s); webhooks: ${r.mfa.webhooks} segredo(s); DataJud: ${r.mfa.datajud} chave(s).`);
  if (r.cert) console.log(`Cofre: ${r.cert.certificates} certificado(s); conexões PJe/MNI: ${r.cert.connections}; tokens do WhatsApp: ${r.cert.whatsapp}; credenciais de tribunais: ${r.cert.courtCredentials}; cofre de clientes: ${r.cert.clientCredentials}.`);
  console.log(r.applied ? "GRAVADO. Agora troque as chaves no .env.production e reinicie o app." : apply ? "Nada a gravar." : "SIMULAÇÃO: tudo abre com a chave antiga. Rode de novo com --apply para gravar.");
  await db.$disconnect();
})().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
