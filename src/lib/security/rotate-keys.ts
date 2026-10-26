import type { Prisma, PrismaClient } from "@prisma/client";
import { openBytes, sealBytes } from "./pfx";
import { decryptSecret, encryptSecret } from "./totp";

export type KeyPair = { old: Buffer; next: Buffer };
export type RotateInput = { mfa?: KeyPair; cert?: KeyPair };
export type RotateReport = { mfa: { userMfa: number; webhooks: number; datajud: number } | null; cert: { certificates: number; connections: number; whatsapp: number; courtCredentials: number; clientCredentials: number } | null; applied: boolean };

/**
 * Troca as chaves de cifra em repouso SEM perder dados: abre cada segredo com a chave antiga e regrava com a nova.
 * MFA_ENCRYPTION_KEY protege: segredos do 2FA, segredos de webhooks e chaves DataJud por escritório. CERT_ENCRYPTION_KEY protege: certificados
 * (arquivo e senha), as credenciais das conexões PJe/MNI, as credenciais dos tribunais por usuário, o cofre de senhas de clientes e o token do WhatsApp. Tudo ou nada: numa única transação; se QUALQUER segredo não
 * abrir com a chave antiga, nada é gravado (evita meia-troca). Com `apply: false` só confere e conta.
 */
export async function rotateKeys(db: PrismaClient, input: RotateInput, opts: { apply: boolean }): Promise<RotateReport> {
  const report: RotateReport = { mfa: null, cert: null, applied: false };
  type Tx = Prisma.TransactionClient;
  const work: ((tx: Tx) => Promise<unknown>)[] = [];
  const failures: string[] = [];

  if (input.mfa) {
    const { old, next } = input.mfa;
    const [mfas, hooks, datajud] = await Promise.all([db.userMfa.findMany({ select: { userId: true, secretEnc: true } }), db.webhookEndpoint.findMany({ select: { id: true, secretEnc: true } }), db.organization.findMany({ where: { datajudApiKeyEnc: { not: null } }, select: { id: true, datajudApiKeyEnc: true } })]);
    const re = (label: string, id: string, stored: string) => {
      try {
        return encryptSecret(decryptSecret(stored, old), next);
      } catch {
        failures.push(`${label} ${id}: não abre com a chave MFA antiga`);
        return null;
      }
    };
    for (const m of mfas) {
      const v = re("2FA do usuário", m.userId, m.secretEnc);
      if (v) work.push((tx) => tx.userMfa.update({ where: { userId: m.userId }, data: { secretEnc: v } }));
    }
    for (const h of hooks) {
      const v = re("webhook", h.id, h.secretEnc);
      if (v) work.push((tx) => tx.webhookEndpoint.update({ where: { id: h.id }, data: { secretEnc: v } }));
    }
    for (const org of datajud) {
      const v = re("DataJud do escritório", org.id, org.datajudApiKeyEnc!);
      if (v) work.push(tx => tx.organization.update({ where: { id: org.id }, data: { datajudApiKeyEnc: v } }));
    }
    report.mfa = { userMfa: mfas.length, webhooks: hooks.length, datajud: datajud.length };
  }

  if (input.cert) {
    const { old, next } = input.cert;
    const [certs, conns, wa] = await Promise.all([db.certificate.findMany({ select: { id: true, pfxEnc: true, passEnc: true, revokedAt: true } }), db.courtConnection.findMany({ select: { id: true, secretEnc: true } }), db.whatsappAccount.findMany({ select: { id: true, tokenEnc: true } })]);
    let nCerts = 0;
    for (const c of certs) {
      if (c.revokedAt || (!c.pfxEnc && !c.passEnc)) continue; // revogado: o conteúdo já foi apagado
      try {
        const pfx = sealBytes(openBytes(c.pfxEnc, old), next);
        const pass = sealBytes(openBytes(c.passEnc, old), next);
        work.push((tx) => tx.certificate.update({ where: { id: c.id }, data: { pfxEnc: pfx, passEnc: pass } }));
        nCerts++;
      } catch {
        failures.push(`certificado ${c.id}: não abre com a chave de cofre antiga`);
      }
    }
    for (const c of conns) {
      try {
        const v = sealBytes(openBytes(c.secretEnc, old), next);
        work.push((tx) => tx.courtConnection.update({ where: { id: c.id }, data: { secretEnc: v } }));
      } catch {
        failures.push(`conexão ${c.id}: não abre com a chave de cofre antiga`);
      }
    }
    for (const w of wa) {
      if (!w.tokenEnc) continue; // conexão por QR-Code: não há token
      try {
        const v = sealBytes(openBytes(w.tokenEnc, old), next);
        work.push((tx) => tx.whatsappAccount.update({ where: { id: w.id }, data: { tokenEnc: v } }));
      } catch {
        failures.push(`WhatsApp ${w.id}: não abre com a chave de cofre antiga`);
      }
    }
    const qr = await db.whatsappQrAuth.findMany({ select: { accountId: true, key: true, valueEnc: true } });
    for (const q of qr) {
      try {
        const v = sealBytes(openBytes(q.valueEnc, old), next);
        work.push((tx) => tx.whatsappQrAuth.update({ where: { accountId_key: { accountId: q.accountId, key: q.key } }, data: { valueEnc: v } }));
      } catch {
        failures.push(`WhatsApp QR ${q.accountId}/${q.key}: não abre com a chave de cofre antiga`);
      }
    }
    const [courtCreds, clientCreds] = await Promise.all([db.courtCredential.findMany({ select: { id: true, secretEnc: true } }), db.clientCredential.findMany({ select: { id: true, secretEnc: true } })]);
    for (const c of courtCreds) {
      try {
        const v = sealBytes(openBytes(c.secretEnc, old), next);
        work.push((tx) => tx.courtCredential.update({ where: { id: c.id }, data: { secretEnc: v } }));
      } catch {
        failures.push(`credencial de tribunal ${c.id}: não abre com a chave de cofre antiga`);
      }
    }
    for (const c of clientCreds) {
      try {
        const v = sealBytes(openBytes(c.secretEnc, old), next);
        work.push((tx) => tx.clientCredential.update({ where: { id: c.id }, data: { secretEnc: v } }));
      } catch {
        failures.push(`cofre de cliente ${c.id}: não abre com a chave de cofre antiga`);
      }
    }
    report.cert = { certificates: nCerts, connections: conns.length, whatsapp: wa.filter((w) => w.tokenEnc).length + qr.length, courtCredentials: courtCreds.length, clientCredentials: clientCreds.length };
  }

  if (failures.length) throw new Error(`Nada foi alterado. Segredos que não abrem com a chave antiga:\n- ${failures.join("\n- ")}`);
  if (opts.apply && work.length) {
    await db.$transaction(async (tx) => {
      for (const w of work) await w(tx);
    });
    report.applied = true;
  }
  return report;
}
