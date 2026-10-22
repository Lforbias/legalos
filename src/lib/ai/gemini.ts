import { AiProviderError } from "./provider";

/** Cliente mínimo da API Gemini (generateContent) para transcrever áudio. Nunca registra o conteúdo enviado nem recebido. */
export type AudioTranscriber = { readonly name: "gemini"; readonly model: string; transcribe(input: { mime: string; data: Buffer }): Promise<{ text: string; inputTokens: number; outputTokens: number }> };

const PROMPT = "Transcreva fielmente, em português do Brasil, o áudio a seguir. Devolva APENAS a transcrição, sem comentários, sem resumo e sem inventar trechos. Se houver partes inaudíveis, escreva [inaudível]. Se não houver fala, escreva [sem fala].";

export class GeminiTranscriber implements AudioTranscriber {
  readonly name = "gemini" as const;
  constructor(private readonly apiKey: string, readonly model: string, private readonly baseUrl = "https://generativelanguage.googleapis.com") {}

  async transcribe({ mime, data }: { mime: string; data: Buffer }) {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: data.toString("base64") } }] }], generationConfig: { temperature: 0 } }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new AiProviderError("Não foi possível falar com o serviço de transcrição agora. Tente novamente em instantes.");
    }
    if (!res.ok) {
      if (res.status === 400 || res.status === 415) throw new AiProviderError("O serviço de transcrição não aceitou este formato de áudio.");
      if (res.status === 401 || res.status === 403) throw new AiProviderError("A chave do Gemini foi recusada pelo provedor. Peça ao administrador para conferi-la.");
      if (res.status === 429) throw new AiProviderError("O Gemini está com limite de uso no momento. Tente novamente em alguns minutos.");
      throw new AiProviderError(`O serviço de transcrição respondeu com erro (${res.status}). Tente novamente.`);
    }
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new AiProviderError("O serviço de transcrição não devolveu texto para este áudio.");
    return { text, inputTokens: body.usageMetadata?.promptTokenCount ?? 0, outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0 };
  }
}

let override: AudioTranscriber | null | undefined;
/** Só para testes. */
export function __setTranscriberForTests(t: AudioTranscriber | null | undefined) {
  override = t;
}

export function getTranscriber(): AudioTranscriber | null {
  if (override !== undefined) return override;
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return new GeminiTranscriber(key, process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash");
}
