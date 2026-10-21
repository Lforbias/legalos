import { Prisma } from "@prisma/client";
import { assertExpansionAllowed } from "./plan.service";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, isSubset } from "@/lib/permissions/check";
import { OWNER_ROLE_KEY } from "@/lib/permissions/roles";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { sendMailSafe } from "@/lib/mail/mailer";
import { product } from "@/config/product";
import { normalizeEmail } from "@/lib/validation/email";
import { assertCan, type RequestMeta, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { appUrl } from "./auth.service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function invitationLink(token: string) {
  return appUrl(`/accept-invite?token=${token}`);
}

export async function createInvitation(ctx: TenantContext, rawInput: { email: string; roleId: string }) {
  assertCan(ctx, "members:invite");
  const input = { ...rawInput, email: normalizeEmail(rawInput.email) };
  const role = await db.role.findFirst({ where: { id: input.roleId, organizationId: ctx.organizationId } });
  if (!role) throw new NotFoundError("Perfil não encontrado.");
  if (role.key === "CLIENT") throw new ValidationError("Convites para o portal do cliente são feitos na ficha do cliente.");
  if (!ctx.isOwner && (role.key === OWNER_ROLE_KEY || !isSubset(role.permissions, ctx.permissions))) {
    throw new ForbiddenError("Você não pode convidar para um perfil com permissões que você não possui.");
  }

  const existingUser = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existingUser) {
    const m = await db.membership.findUnique({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId: existingUser.id } },
      select: { id: true },
    });
    if (m) throw new ConflictError("Este usuário já faz parte do escritório.");
  }

  await assertExpansionAllowed(ctx.organizationId);
  // Limite de usuários do plano (membros + convites pendentes)
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organizationId }, include: { plan: true } });
  if (sub?.plan.maxUsers != null) {
    const [members, pending] = await Promise.all([
      db.membership.count({ where: { organizationId: ctx.organizationId } }),
      db.invitation.count({
        where: { organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);
    if (members + pending >= sub.plan.maxUsers) {
      throw new ConflictError(`O plano ${sub.plan.name} permite até ${sub.plan.maxUsers} usuários (incluindo convites pendentes).`);
    }
  }

  const token = generateToken();
  try {
    // expira convites antigos do mesmo e-mail para liberar o índice único parcial
    await db.invitation.updateMany({
      where: { organizationId: ctx.organizationId, email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { lte: new Date() } },
      data: { revokedAt: new Date() },
    });
    const invitation = await db.invitation.create({
      data: {
        organizationId: ctx.organizationId,
        email: input.email,
        roleId: role.id,
        tokenHash: hashToken(token),
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } });
    const sent = await sendMailSafe({
      to: input.email,
      subject: `Convite para ${org.name} — ${product.name}`,
      text: `Você foi convidado(a) para ${org.name} como ${role.name}. Aceite em: ${invitationLink(token)}`,
    });
    await audit({
      action: "invitation.create",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceType: "invitation",
      resourceId: invitation.id,
      metadata: { email: input.email, role: role.key },
      meta: ctx.meta,
    });
    // O token em claro só existe agora; é devolvido uma única vez para exibição do link.
    return { id: invitation.id, link: invitationLink(token), emailDelivered: sent.delivered };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("Já existe um convite pendente para este e-mail.");
    }
    throw err;
  }
}

export async function listInvitations(ctx: TenantContext) {
  assertCan(ctx, "members:invite");
  const rows = await db.invitation.findMany({
    where: { organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, createdAt: true, expiresAt: true, role: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...r, expired: r.expiresAt <= new Date() }));
}

export async function revokeInvitation(ctx: TenantContext, invitationId: string) {
  assertCan(ctx, "members:invite");
  const res = await db.invitation.updateMany({
    where: { id: invitationId, organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) throw new NotFoundError("Convite não encontrado.");
  await audit({
    action: "invitation.revoke",
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    resourceType: "invitation",
    resourceId: invitationId,
    meta: ctx.meta,
  });
}

/** Pré-visualização pública (sem login): revela apenas o mínimo necessário para aceitar. */
export async function previewInvitation(token: string) {
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      email: true,
      acceptedAt: true,
      revokedAt: true,
      expiresAt: true,
      organization: { select: { name: true, deletedAt: true } },
      role: { select: { name: true } },
    },
  });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= new Date() || inv.organization.deletedAt) return null;
  const hasAccount = (await db.user.count({ where: { email: inv.email } })) > 0;
  return { email: inv.email, organizationName: inv.organization.name, roleName: inv.role.name, hasAccount };
}

export async function acceptInvitation(userId: string, token: string, meta: RequestMeta) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerifiedAt: true } });
  if (!user) throw new NotFoundError("Usuário não encontrado.");

  return db.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= new Date()) {
      throw new ValidationError("Convite inválido, expirado ou já utilizado.");
    }
    if (inv.email !== user.email) {
      await audit(
        { action: "invitation.accept", organizationId: inv.organizationId, userId, result: "DENIED", metadata: { reason: "email_mismatch" }, meta },
        tx,
      );
      throw new ForbiddenError("Este convite foi enviado para outro e-mail. Entre com a conta convidada.");
    }
    // Consumo atômico: apenas uma requisição concorrente consegue marcar como aceito.
    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date(), acceptedById: userId },
    });
    if (claimed.count !== 1) throw new ValidationError("Convite inválido, expirado ou já utilizado.");

    const existing = await tx.membership.findUnique({
      where: { organizationId_userId: { organizationId: inv.organizationId, userId } },
    });
    if (existing) {
      // pessoa que já é cliente do portal neste escritório pode receber acesso a outro cliente
      const role = await tx.role.findUnique({ where: { id: existing.roleId }, select: { key: true } });
      if (inv.clientId && role?.key === "CLIENT") {
        const already = await tx.portalAccount.count({ where: { organizationId: inv.organizationId, userId, clientId: inv.clientId, revokedAt: null } });
        if (!already) await tx.portalAccount.create({ data: { organizationId: inv.organizationId, userId, clientId: inv.clientId, createdById: inv.invitedById } });
        await audit({ action: "invitation.accept", organizationId: inv.organizationId, userId, resourceType: "membership", resourceId: existing.id, meta }, tx);
        return { organizationId: inv.organizationId };
      }
      throw new ConflictError("Você já faz parte deste escritório.");
    }
    const membership = await tx.membership.create({ data: { organizationId: inv.organizationId, userId, roleId: inv.roleId } });
    if (inv.clientId) {
      await tx.portalAccount.create({ data: { organizationId: inv.organizationId, userId, clientId: inv.clientId, createdById: inv.invitedById } });
    }
    // Posse do token enviado ao e-mail convidado comprova controle do e-mail.
    if (!user.emailVerifiedAt) await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await audit(
      {
        action: "invitation.accept",
        organizationId: inv.organizationId,
        userId,
        resourceType: "membership",
        resourceId: membership.id,
        meta,
      },
      tx,
    );
    return { organizationId: inv.organizationId };
  });
}
