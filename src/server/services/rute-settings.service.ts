import { db } from "@/lib/db/client";
import { decryptSecret, encryptSecret, mfaKey } from "@/lib/security/totp";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/**
 * 6.0 — configurações da RUTE por escritório. Tudo nasce DESLIGADO. Ligar o MCP exige consentimento explícito
 * (o conteúdo consultado sai do LegalOS para a IA que a pessoa conectou). A parada de emergência corta MCP, assistente e novas propostas.
 */
export const PROVIDERS = { ANTHROPIC: "Claude (Anthropic)", GEMINI: "Gemini (Google)", OPENAI: "OpenAI" } as const;
export type ProviderKey = keyof typeof PROVIDERS;
export const DEFAULT_MODELS: Record<ProviderKey, string> = { ANTHROPIC: "claude-sonnet-4-5", GEMINI: "gemini-2.5-flash", OPENAI: "gpt-4.1-mini" };

export type RuteFeature = "mcp" | "proposals" | "assistant";
const COL = { mcp: "mcpEnabled", proposals: "proposalsEnabled", assistant: "assistantEnabled" } as const;

const key = () => {
  const k = mfaKey();
  if (!k) throw new ConflictError("A chave de cifra do sistema (MFA_ENCRYPTION_KEY) não está configurada.");
  return k;
};

async function row(orgId: string) {
  return db.ruteSettings.findUnique({ where: { organizationId: orgId } });
}

export async function getRuteSettings(ctx: TenantContext) {
  assertCan(ctx, "ai:use");
  const r = await row(ctx.organizationId);
  return {
    mcpEnabled: r?.mcpEnabled ?? false,
    proposalsEnabled: r?.proposalsEnabled ?? false,
    assistantEnabled: r?.assistantEnabled ?? false,
    provider: (r?.provider ?? "ANTHROPIC") as ProviderKey,
    model: r?.model ?? null,
    hasOfficeKey: !!r?.apiKeyEnc,
    emergencyStop: r?.emergencyStop ?? false,
    retentionDays: r?.retentionDays ?? 90,
    monthlyTokenLimit: r?.monthlyTokenLimit ?? null,
    roleLimits: (r?.roleLimits ?? {}) as Record<string, number>,
    consentAt: r?.consentAt ?? null,
  };
}

/** Usado pelo servidor MCP, pelo assistente e pelas propostas antes de qualquer coisa. */
export async function assertRuteOn(orgId: string, feature: RuteFeature, opts: { allowDuringStop?: boolean } = {}) {
  const r = await row(orgId);
  if (r?.emergencyStop && !opts.allowDuringStop) throw new ConflictError("A RUTE está em parada de emergência neste escritório. Quem administra as integrações precisa liberar.");
  if (!r || !r[COL[feature]]) {
    const what = { mcp: "A conexão de IAs externas (MCP)", proposals: "As propostas da IA", assistant: "O assistente embutido" }[feature];
    throw new ConflictError(`${what} está desligada neste escritório. Quem administra as integrações liga em RUTE → Situação.`);
  }
  return r;
}

export async function setRuteFeature(ctx: TenantContext, feature: RuteFeature, on: boolean, opts: { consent?: boolean } = {}) {
  assertCan(ctx, "integrations:manage");
  const cur = await row(ctx.organizationId);
  if (on && feature === "mcp" && !opts.consent && !cur?.consentAt) throw new ValidationError("Para ligar, confirme que entende que o conteúdo consultado sai do LegalOS para a IA conectada.", { consent: ["Confirme o consentimento."] });
  const data = { [COL[feature]]: on, ...(on && opts.consent ? { consentAt: new Date(), consentById: ctx.userId } : {}) };
  await db.ruteSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  await audit({ action: on ? "rute.enable" : "rute.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, metadata: { feature }, meta: ctx.meta });
}

export async function setEmergencyStop(ctx: TenantContext, on: boolean) {
  assertCan(ctx, "integrations:manage");
  await db.ruteSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, emergencyStop: on }, update: { emergencyStop: on } });
  await audit({ action: on ? "rute.emergency_stop" : "rute.emergency_release", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, meta: ctx.meta });
}

export async function setAssistantProvider(ctx: TenantContext, input: { provider: string; model?: string; apiKey?: string; clearKey?: boolean }) {
  assertCan(ctx, "integrations:manage");
  if (!Object.hasOwn(PROVIDERS, input.provider)) throw new ValidationError("Escolha o provedor.", { provider: ["Escolha o provedor."] });
  const model = input.model?.trim() || null;
  if (model && !/^[\w.:/-]{2,80}$/.test(model)) throw new ValidationError("Nome de modelo inválido.", { model: ["Nome de modelo inválido."] });
  const k = input.apiKey?.trim();
  if (k && (k.length < 20 || k.length > 300 || /\s/.test(k))) throw new ValidationError("A chave parece inválida.", { apiKey: ["Chave inválida."] });
  if (k && input.clearKey) throw new ValidationError("Escolha entre trocar ou remover a chave.");
  const previous = await row(ctx.organizationId);
  const changingProvider = previous && previous.provider !== input.provider;
  const data = { provider: input.provider, model, ...(changingProvider && !k ? { apiKeyEnc: null } : {}), ...(k ? { apiKeyEnc: encryptSecret(k, key()) } : {}), ...(input.clearKey ? { apiKeyEnc: null } : {}) };
  await db.ruteSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  await audit({ action: "rute.provider", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, metadata: { provider: input.provider, keyChanged: !!k }, meta: ctx.meta });
}

/** Chave do escritório (decifrada) — só para uso interno do assistente. */
export async function officeProviderKey(orgId: string): Promise<string | null> {
  const r = await row(orgId);
  return r?.apiKeyEnc ? decryptSecret(r.apiKeyEnc, key()) : null;
}

export async function setGovernance(ctx: TenantContext, input: { retentionDays?: number; monthlyTokenLimit?: number | null; roleLimits?: Record<string, number> }) {
  assertCan(ctx, "integrations:manage");
  const data: { retentionDays?: number; monthlyTokenLimit?: number | null; roleLimits?: Record<string, number> } = {};
  if (input.retentionDays !== undefined) {
    if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 730) throw new ValidationError("A retenção deve ser de 1 a 730 dias.", { retentionDays: ["Use de 1 a 730 dias."] });
    data.retentionDays = input.retentionDays;
  }
  if (input.monthlyTokenLimit !== undefined) {
    const v = input.monthlyTokenLimit;
    if (v !== null && (!Number.isInteger(v) || v < 1000 || v > 1_000_000_000)) throw new ValidationError("Limite inválido (mínimo 1.000).", { monthlyTokenLimit: ["Limite inválido."] });
    data.monthlyTokenLimit = v;
  }
  if (input.roleLimits !== undefined) {
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.roleLimits)) {
      if (!/^[A-Z0-9_]{2,40}$/.test(k)) throw new ValidationError("Perfil inválido.");
      if (v === 0 || v === null) continue;
      if (!Number.isInteger(v) || v < 1000 || v > 1_000_000_000) throw new ValidationError(`Limite inválido para ${k} (mínimo 1.000).`);
      clean[k] = v;
    }
    data.roleLimits = clean;
  }
  await db.ruteSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  await audit({ action: "rute.governance", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, metadata: data as Record<string, unknown>, meta: ctx.meta });
}
