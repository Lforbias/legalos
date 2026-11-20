/**
 * Alerta de erro do servidor para um webhook (Slack, Discord, Teams, n8n…), configurado em ALERT_WEBHOOK_URL.
 * Não envia dados pessoais: só a mensagem do erro, o código (digest), o caminho SEM query string e o tipo de rota.
 * Limita a 1 alerta por assinatura de erro a cada 5 minutos para não inundar o canal.
 */
const recent = new Map<string, number>();
const WINDOW_MS = 5 * 60_000;

export type ErrorAlert = { message: string; digest?: string; path: string; method: string; routeType?: string };

export function alertPayload(a: ErrorAlert, env: string | undefined) {
  const where = `${a.method} ${a.path.split("?")[0]}`;
  const text = `🚨 LegalOS (${env ?? "produção"}): erro no servidor em ${where}${a.routeType ? ` [${a.routeType}]` : ""}\n${a.message.slice(0, 300)}${a.digest ? `\ncódigo: ${a.digest}` : ""}`;
  return { text, content: text };
}

export function shouldSend(key: string, now = Date.now()): boolean {
  const last = recent.get(key);
  if (last !== undefined && now - last < WINDOW_MS) return false;
  recent.set(key, now);
  if (recent.size > 500) for (const [k, t] of recent) if (now - t >= WINDOW_MS) recent.delete(k);
  return true;
}

export async function sendErrorAlert(a: ErrorAlert, fetchFn: typeof fetch = fetch): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url || !/^https:\/\//.test(url)) return;
  if (!shouldSend(`${a.digest ?? a.message.slice(0, 120)}|${a.path.split("?")[0]}`)) return;
  try {
    await fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(alertPayload(a, process.env.ALERT_ENV_NAME)), signal: AbortSignal.timeout(3000), redirect: "error" });
  } catch {
    // alerta nunca derruba o app
  }
}
