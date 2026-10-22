import { AiProviderError } from "./provider";

/**
 * 6.0-F5 — conversa com ferramentas em vários provedores. Cada adaptador conduz o seu próprio laço
 * (modelo pede ferramenta → LegalOS executa → devolve o resultado) no formato nativo do provedor.
 * Nunca registra o conteúdo enviado nem recebido. Sem SDK: só fetch.
 */
export type ToolSpec = { name: string; description: string; input: { type: "object"; properties: Record<string, unknown>; required?: string[] } };
export type ChatTurn = { role: "user" | "assistant"; text: string };
export type ToolChatResult = { text: string; inputTokens: number; outputTokens: number; model: string; toolCalls: number };
export type RunTool = (name: string, args: unknown) => Promise<string>;
export type ToolChatInput = { system: string; history: ChatTurn[]; tools: ToolSpec[]; runTool: RunTool; maxTokens: number; maxSteps: number };

export interface ToolChatProvider {
  readonly name: "anthropic" | "gemini" | "openai" | string;
  readonly model: string;
  run(input: ToolChatInput): Promise<ToolChatResult>;
}

const NO_REPLY = "O serviço de IA não devolveu resposta. Tente reformular a pergunta.";
const STEP_LIMIT = "Cheguei ao limite de consultas desta resposta. Peça de forma mais específica.";

async function post(url: string, headers: Record<string, string>, body: unknown, label: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
  } catch {
    throw new AiProviderError("Não foi possível falar com o serviço de IA agora. Tente novamente em instantes.");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`A chave de IA (${label}) foi recusada pelo provedor. Peça a quem administra para conferi-la.`);
    if (res.status === 429) throw new AiProviderError(`O provedor de IA (${label}) está com limite de uso no momento. Tente novamente em alguns minutos.`);
    throw new AiProviderError(`O serviço de IA (${label}) respondeu com erro (${res.status}). Tente novamente.`);
  }
  try {
    return await res.json();
  } catch {
    throw new AiProviderError("Resposta inválida do serviço de IA.");
  }
}

const parseArgs = (s: unknown): unknown => {
  if (typeof s !== "string") return s ?? {};
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
};

// ----------------------------- Anthropic -----------------------------
type AnthropicBlock = { type: string; text?: string; id?: string; name?: string; input?: unknown };
export class AnthropicToolChat implements ToolChatProvider {
  readonly name = "anthropic";
  constructor(private readonly apiKey: string, readonly model: string, private readonly baseUrl = "https://api.anthropic.com") {}

  async run(i: ToolChatInput): Promise<ToolChatResult> {
    const messages: { role: string; content: unknown }[] = i.history.map((t) => ({ role: t.role, content: t.text }));
    const tools = i.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input }));
    let inT = 0, outT = 0, calls = 0, model = this.model;
    for (let step = 0; step < i.maxSteps; step++) {
      const b = (await post(`${this.baseUrl}/v1/messages`, { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" }, { model: this.model, max_tokens: i.maxTokens, system: i.system, messages, ...(tools.length ? { tools } : {}) }, "Claude")) as { content?: AnthropicBlock[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number }; model?: string };
      inT += b.usage?.input_tokens ?? 0;
      outT += b.usage?.output_tokens ?? 0;
      model = b.model ?? model;
      const content = b.content ?? [];
      const uses = content.filter((c) => c.type === "tool_use");
      if (uses.length === 0) {
        const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
        if (!text) throw new AiProviderError(NO_REPLY);
        return { text, inputTokens: inT, outputTokens: outT, model, toolCalls: calls };
      }
      messages.push({ role: "assistant", content });
      const results = [];
      for (const u of uses) {
        calls++;
        results.push({ type: "tool_result", tool_use_id: u.id, content: await i.runTool(u.name ?? "", u.input) });
      }
      messages.push({ role: "user", content: results });
    }
    return { text: STEP_LIMIT, inputTokens: inT, outputTokens: outT, model, toolCalls: calls };
  }
}

// ----------------------------- OpenAI -----------------------------
type OpenAiMsg = { role: string; content?: string | null; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]; tool_call_id?: string };
export class OpenAiToolChat implements ToolChatProvider {
  readonly name = "openai";
  constructor(private readonly apiKey: string, readonly model: string, private readonly baseUrl = "https://api.openai.com") {}

  async run(i: ToolChatInput): Promise<ToolChatResult> {
    const messages: OpenAiMsg[] = [{ role: "system", content: i.system }, ...i.history.map((t) => ({ role: t.role, content: t.text }))];
    const tools = i.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input } }));
    let inT = 0, outT = 0, calls = 0, model = this.model;
    for (let step = 0; step < i.maxSteps; step++) {
      const b = (await post(`${this.baseUrl}/v1/chat/completions`, { authorization: `Bearer ${this.apiKey}` }, { model: this.model, max_completion_tokens: i.maxTokens, messages, ...(tools.length ? { tools } : {}) }, "OpenAI")) as { choices?: { message?: OpenAiMsg }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
      inT += b.usage?.prompt_tokens ?? 0;
      outT += b.usage?.completion_tokens ?? 0;
      model = b.model ?? model;
      const m = b.choices?.[0]?.message;
      if (!m) throw new AiProviderError(NO_REPLY);
      const tc = m.tool_calls ?? [];
      if (tc.length === 0) {
        const text = (m.content ?? "").trim();
        if (!text) throw new AiProviderError(NO_REPLY);
        return { text, inputTokens: inT, outputTokens: outT, model, toolCalls: calls };
      }
      messages.push({ role: "assistant", content: m.content ?? null, tool_calls: tc });
      for (const c of tc) {
        calls++;
        messages.push({ role: "tool", tool_call_id: c.id, content: await i.runTool(c.function.name, parseArgs(c.function.arguments)) });
      }
    }
    return { text: STEP_LIMIT, inputTokens: inT, outputTokens: outT, model, toolCalls: calls };
  }
}

// ----------------------------- Gemini -----------------------------
type GemPart = { text?: string; functionCall?: { name: string; args?: unknown }; functionResponse?: { name: string; response: unknown } };
export class GeminiToolChat implements ToolChatProvider {
  readonly name = "gemini";
  constructor(private readonly apiKey: string, readonly model: string, private readonly baseUrl = "https://generativelanguage.googleapis.com") {}

  async run(i: ToolChatInput): Promise<ToolChatResult> {
    const contents: { role: string; parts: GemPart[] }[] = i.history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] }));
    const decls = i.tools.map((t) => ({ name: t.name, description: t.description, ...(Object.keys(t.input.properties).length ? { parameters: t.input } : {}) }));
    let inT = 0, outT = 0, calls = 0;
    for (let step = 0; step < i.maxSteps; step++) {
      const b = (await post(`${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, { "x-goog-api-key": this.apiKey }, { systemInstruction: { parts: [{ text: i.system }] }, contents, generationConfig: { maxOutputTokens: i.maxTokens }, ...(decls.length ? { tools: [{ functionDeclarations: decls }] } : {}) }, "Gemini")) as { candidates?: { content?: { parts?: GemPart[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      inT += b.usageMetadata?.promptTokenCount ?? 0;
      outT += b.usageMetadata?.candidatesTokenCount ?? 0;
      const parts = b.candidates?.[0]?.content?.parts ?? [];
      const fcs = parts.filter((p) => p.functionCall);
      if (fcs.length === 0) {
        const text = parts.map((p) => p.text ?? "").join("").trim();
        if (!text) throw new AiProviderError(NO_REPLY);
        return { text, inputTokens: inT, outputTokens: outT, model: this.model, toolCalls: calls };
      }
      contents.push({ role: "model", parts });
      const resp: GemPart[] = [];
      for (const p of fcs) {
        calls++;
        const name = p.functionCall?.name ?? "";
        resp.push({ functionResponse: { name, response: { result: await i.runTool(name, p.functionCall?.args ?? {}) } } });
      }
      contents.push({ role: "user", parts: resp });
    }
    return { text: STEP_LIMIT, inputTokens: inT, outputTokens: outT, model: this.model, toolCalls: calls };
  }
}

let override: ToolChatProvider | null | undefined;
/** Só para testes: injeta um provedor (ou `null` para simular "sem chave"). */
export function __setToolChatForTests(p: ToolChatProvider | null | undefined) {
  override = p;
}
export const toolChatOverride = () => override;

/** Base URLs só para testes com servidores falsos. */
export function buildToolChat(provider: string, apiKey: string, model: string, baseUrl?: string): ToolChatProvider {
  if (provider === "GEMINI") return new GeminiToolChat(apiKey, model, baseUrl);
  if (provider === "OPENAI") return new OpenAiToolChat(apiKey, model, baseUrl);
  return new AnthropicToolChat(apiKey, model, baseUrl);
}
