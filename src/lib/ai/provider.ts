
export type AiMessage = { role: "user" | "assistant"; content: string };
export type AiCompletion = { text: string; inputTokens: number; outputTokens: number; model: string };

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete(input: { system: string; messages: AiMessage[]; maxTokens: number }): Promise<AiCompletion>;
}

export class AiProviderError extends Error {}

/** Cliente mínimo da API de mensagens da Anthropic (sem SDK). Nunca registra o conteúdo enviado nem recebido. */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = "https://api.anthropic.com",
  ) {}

  async complete({ system, messages, maxTokens }: { system: string; messages: AiMessage[]; maxTokens: number }): Promise<AiCompletion> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: this.model, max_tokens: maxTokens, system, messages }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new AiProviderError("Não foi possível falar com o serviço de IA agora. Tente novamente em instantes.");
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new AiProviderError("A chave de IA configurada foi recusada pelo provedor. Peça ao administrador para conferi-la.");
      if (res.status === 429) throw new AiProviderError("O provedor de IA está com limite de uso no momento. Tente novamente em alguns minutos.");
      throw new AiProviderError(`O serviço de IA respondeu com erro (${res.status}). Tente novamente.`);
    }
    const body = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string };
    const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (!text) throw new AiProviderError("O serviço de IA não devolveu texto. Tente reformular a pergunta.");
    return { text, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0, model: body.model ?? this.model };
  }
}

let override: AiProvider | null | undefined;
/** Só para testes: injeta um provedor (ou `null` para simular "sem chave"). Nunca usado em produção. */
export function __setAiProviderForTests(p: AiProvider | null | undefined) {
  override = p;
}

/** Provedor configurado por ambiente, ou `null` quando não há chave (o recurso fica desligado, sem respostas falsas). */
export function getAiProvider(): AiProvider | null {
  if (override !== undefined) return override;
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  return new AnthropicProvider(key, process.env.AI_MODEL?.trim() || "claude-sonnet-4-5");
}

export function aiMonthlyTokenLimit(): number {
  const n = Number.parseInt(process.env.AI_MONTHLY_TOKEN_LIMIT ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 500_000;
}
