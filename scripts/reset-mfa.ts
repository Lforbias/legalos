import "./load-env";
import { db } from "../src/lib/db/client";
import { decryptSecret, mfaKey } from "../src/lib/security/totp";

/**
 * Uso: npm run reset-mfa -- <email>
 * Remove o 2FA de um usuário SOMENTE se o segredo gravado não abre com a chave atual (foi gravado com outra chave e não
 * tem recuperação). Se abre, recusa: use "desativar 2FA" em Minha conta. Também apaga as sessões do usuário.
 */
(async () => {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Uso: npm run reset-mfa -- <email>");
    process.exit(1);
  }
  const key = mfaKey();
  if (!key) {
    console.error("MFA_ENCRYPTION_KEY ausente ou inválida no .env.");
    process.exit(1);
  }
  const user = await db.user.findFirst({ where: { email }, select: { id: true, email: true } });
  const mfa = user ? await db.userMfa.findUnique({ where: { userId: user.id } }) : null;
  if (!user || !mfa) {
    console.error("Usuário não encontrado ou sem 2FA.");
    process.exit(1);
  }
  let opens = true;
  try { decryptSecret(mfa.secretEnc, key); } catch { opens = false; }
  if (opens) {
    console.error("O 2FA deste usuário abre normalmente com a chave atual: não há o que resetar. Desative em Minha conta.");
    process.exit(1);
  }
  await db.$transaction([
    db.userMfa.delete({ where: { userId: user.id } }),
    db.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    db.mfaChallenge.deleteMany({ where: { userId: user.id } }),
    db.session.deleteMany({ where: { userId: user.id } }),
  ]);
  console.log(`2FA de ${user.email} removido (o segredo antigo era ilegível). Entre de novo e, se quiser, ative o 2FA outra vez.`);
  await db.$disconnect();
})();
