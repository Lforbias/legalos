import "./load-env";
import { db } from "../src/lib/db/client";

/** Uso: npm run platform-admin -- grant|revoke|list [email]  — única forma de criar ou remover super-administradores. */
(async () => {
  const [cmd, emailArg] = process.argv.slice(2);
  if (cmd === "list") {
    const rows = await db.platformAdmin.findMany({ include: { user: { select: { email: true, name: true } } }, orderBy: { grantedAt: "asc" } });
    console.log(rows.length ? rows.map((r) => `${r.user.email} (${r.user.name}) desde ${r.grantedAt.toISOString()}`).join("\n") : "Nenhum super-administrador.");
    return;
  }
  if ((cmd !== "grant" && cmd !== "revoke") || !emailArg) {
    console.error("Uso: platform-admin grant|revoke <email>  |  platform-admin list");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email: emailArg.trim().toLowerCase() }, select: { id: true, email: true } });
  if (!user) {
    console.error("Usuário não encontrado.");
    process.exit(1);
  }
  if (cmd === "grant") {
    await db.platformAdmin.upsert({ where: { userId: user.id }, create: { userId: user.id, grantedNote: "script platform-admin" }, update: {} });
    await db.auditLog.create({ data: { action: "platform.admin_grant", userId: user.id, resourceType: "user", resourceId: user.id, metadata: { via: "script" } } });
    console.log(`${user.email} agora é super-administrador. O acesso ao painel exige 2FA ativo.`);
  } else {
    const r = await db.platformAdmin.deleteMany({ where: { userId: user.id } });
    await db.auditLog.create({ data: { action: "platform.admin_revoke", userId: user.id, resourceType: "user", resourceId: user.id, metadata: { via: "script" } } });
    console.log(r.count ? `${user.email} deixou de ser super-administrador.` : "Esse usuário não era super-administrador.");
  }
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
