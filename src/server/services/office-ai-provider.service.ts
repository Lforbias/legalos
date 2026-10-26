import type { AiProvider } from "@/lib/ai/provider";
import { aiProviderOverride } from "@/lib/ai/provider";
import { buildToolChat, type ToolChatProvider } from "@/lib/ai/tool-chat";
import { db } from "@/lib/db/client";
import { DEFAULT_MODELS, officeProviderKey, type ProviderKey } from "./rute-settings.service";

const ENV_KEY: Record<ProviderKey, string> = { ANTHROPIC: "ANTHROPIC_API_KEY", GEMINI: "GEMINI_API_KEY", OPENAI: "OPENAI_API_KEY" };
/** Uma configuração por escritório para a RUTE e as ferramentas de IA. Segredos ficam no servidor. */
export async function officeToolProvider(organizationId: string): Promise<ToolChatProvider | null> {
  const s = await db.ruteSettings.findUnique({ where: { organizationId }, select: { provider: true, model: true } });
  const provider = (s?.provider ?? "ANTHROPIC") as ProviderKey;
  const secret = (await officeProviderKey(organizationId)) ?? process.env[ENV_KEY[provider]]?.trim();
  if (!secret) return null;
  const model = s?.model || (provider === "ANTHROPIC" ? process.env.AI_MODEL?.trim() || DEFAULT_MODELS.ANTHROPIC : DEFAULT_MODELS[provider]);
  return buildToolChat(provider, secret, model);
}

export async function officeAiProvider(organizationId: string): Promise<AiProvider | null> {
  const override = aiProviderOverride();
  if (override !== undefined) return override;
  const provider = await officeToolProvider(organizationId);
  if (!provider) return null;
  return {
    name: provider.name, model: provider.model,
    async complete(input) {
      const r = await provider.run({ system: input.system, history: input.messages.map(m => ({ role: m.role, text: m.content })), tools: [], runTool: async () => "", maxTokens: input.maxTokens, maxSteps: 1 });
      return { text: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model };
    },
  };
}
