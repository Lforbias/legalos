import { db } from "@/lib/db/client";
import { ConflictError } from "@/lib/permissions/check";

/** Dias de aviso antes do fim do teste. */
const TRIAL_WARNING_DAYS = 3;

export type PlanState = "ok" | "trial_ending" | "trial_expired" | "past_due" | "canceled" | "none";

export type Entitlements = {
  planKey: string | null;
  planName: string | null;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | null;
  trialEndsAt: Date | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: Date | null;
  state: PlanState;
  /** Estado que bloqueia só o que AUMENTA o uso (enviar arquivo, IA, convidar). Leitura, download e exclusão nunca são bloqueados. */
  expansionBlocked: boolean;
  limits: { maxUsers: number | null; maxStorageMb: number | null; maxAiTokensMonth: number | null };
  features: string[];
};

export type Usage = { users: number; pendingInvites: number; storageBytes: number; aiTokensMonth: number };

/** Interpreta a assinatura (sem inventar: sem assinatura = sem bloqueio e sem limites do plano). */
export function resolveEntitlements(
  sub: { status: Entitlements["status"]; trialEndsAt: Date | null; currentPeriodEnd: Date | null; plan: { key: string; name: string; maxUsers: number | null; maxStorageMb: number | null; maxAiTokensMonth: number | null; features: string[] } } | null,
  now = new Date(),
): Entitlements {
  if (!sub) {
    return { planKey: null, planName: null, status: null, trialEndsAt: null, trialDaysLeft: null, currentPeriodEnd: null, state: "none", expansionBlocked: false, limits: { maxUsers: null, maxStorageMb: null, maxAiTokensMonth: null }, features: [] };
  }
  const daysLeft = sub.trialEndsAt ? Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000) : null;
  let state: PlanState = "ok";
  if (sub.status === "CANCELED") state = "canceled";
  else if (sub.status === "PAST_DUE") state = "past_due";
  else if (sub.status === "TRIALING") {
    if (sub.trialEndsAt && sub.trialEndsAt <= now) state = "trial_expired";
    else if (daysLeft !== null && daysLeft <= TRIAL_WARNING_DAYS) state = "trial_ending";
  }
  return {
    planKey: sub.plan.key,
    planName: sub.plan.name,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
    trialDaysLeft: daysLeft === null ? null : Math.max(0, daysLeft),
    currentPeriodEnd: sub.currentPeriodEnd,
    state,
    expansionBlocked: state === "trial_expired" || state === "canceled",
    limits: { maxUsers: sub.plan.maxUsers, maxStorageMb: sub.plan.maxStorageMb, maxAiTokensMonth: sub.plan.maxAiTokensMonth },
    features: sub.plan.features,
  };
}

export async function getEntitlements(organizationId: string): Promise<Entitlements> {
  const sub = await db.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
  return resolveEntitlements(sub);
}

function monthStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function getUsage(organizationId: string): Promise<Usage> {
  const [users, pendingInvites, storage, ai] = await Promise.all([
    db.membership.count({ where: { organizationId, status: "ACTIVE" } }),
    db.invitation.count({ where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.documentVersion.aggregate({ where: { organizationId, document: { is: { deletedAt: null } } }, _sum: { sizeBytes: true } }),
    db.aiUsage.aggregate({ where: { organizationId, createdAt: { gte: monthStart() } }, _sum: { inputTokens: true, outputTokens: true } }),
  ]);
  return { users, pendingInvites, storageBytes: storage._sum.sizeBytes ?? 0, aiTokensMonth: (ai._sum.inputTokens ?? 0) + (ai._sum.outputTokens ?? 0) };
}

const STATE_MESSAGE: Record<string, string> = {
  trial_expired: "O período de teste do escritório terminou. Seus dados continuam disponíveis para consulta e download; para enviar novos arquivos, usar a IA ou convidar pessoas, contrate um plano com a administração da plataforma.",
  canceled: "A assinatura do escritório está cancelada. Seus dados continuam disponíveis para consulta e download; para voltar a enviar arquivos, usar a IA ou convidar pessoas, reative o plano com a administração da plataforma.",
};

/** Bloqueia só ações que aumentam o uso quando o teste venceu ou a assinatura foi cancelada. */
export async function assertExpansionAllowed(organizationId: string): Promise<Entitlements> {
  const e = await getEntitlements(organizationId);
  if (e.expansionBlocked) throw new ConflictError(STATE_MESSAGE[e.state] ?? "A assinatura do escritório não permite esta ação.");
  return e;
}

/** Antes de gravar arquivo: situação da assinatura + cota de armazenamento do plano. */
export async function assertStorageAvailable(organizationId: string, incomingBytes: number): Promise<void> {
  const e = await assertExpansionAllowed(organizationId);
  if (e.limits.maxStorageMb == null) return;
  const { storageBytes } = await getUsage(organizationId);
  const limit = e.limits.maxStorageMb * 1024 * 1024;
  if (storageBytes + incomingBytes > limit) {
    throw new ConflictError(`O plano ${e.planName} inclui ${e.limits.maxStorageMb.toLocaleString("pt-BR")} MB de armazenamento e o escritório já usa ${(storageBytes / 1048576).toFixed(1).replace(".", ",")} MB. Exclua arquivos que não precisa mais ou peça um plano maior.`);
  }
}

/** Limite mensal de tokens de IA: o menor entre o do plano e o do sistema. Plano com 0 não inclui IA. */
export function effectiveAiLimit(planLimit: number | null, systemLimit: number): number {
  return planLimit == null ? systemLimit : Math.min(planLimit, systemLimit);
}

export async function assertAiAllowed(organizationId: string, systemLimit: number): Promise<void> {
  const e = await assertExpansionAllowed(organizationId);
  if (e.limits.maxAiTokensMonth === 0) throw new ConflictError(`O plano ${e.planName} não inclui o assistente de IA.`);
  const { aiTokensMonth } = await getUsage(organizationId);
  if (aiTokensMonth >= effectiveAiLimit(e.limits.maxAiTokensMonth, systemLimit)) throw new ConflictError("O limite mensal de uso de IA do escritório foi atingido.");
}
