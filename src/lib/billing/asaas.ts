/**
 * Cliente mínimo da API do Asaas (v3). Não guarda estado. A chave NUNCA vai para log nem para mensagens de erro.
 * Atenção: foi escrito a partir da documentação pública e testado contra um servidor SIMULADO; a primeira
 * integração real deve ser feita na SANDBOX do Asaas (ASAAS_ENV=sandbox) antes de cobrar clientes de verdade.
 */
export type AsaasConfig = { apiKey: string; webhookToken: string; baseUrl: string; sandbox: boolean };

export class BillingProviderError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly retryable = false) {
    super(message);
    this.name = "BillingProviderError";
  }
}

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const PROD_URL = "https://api.asaas.com/v3";

export function asaasConfigFromEnv(env: Record<string, string | undefined> = process.env): { config?: AsaasConfig; error?: string } {
  const apiKey = env.ASAAS_API_KEY?.trim();
  if (!apiKey) return { error: "ASAAS_API_KEY não definida." };
  const token = env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!token || token.length < 24) return { error: "ASAAS_WEBHOOK_TOKEN ausente ou curto (mínimo 24 caracteres; gere com `openssl rand -hex 24`)." };
  const mode = env.ASAAS_ENV ?? "sandbox";
  if (mode !== "sandbox" && mode !== "production") return { error: "ASAAS_ENV deve ser sandbox ou production." };
  const override = env.ASAAS_API_URL?.trim();
  return { config: { apiKey, webhookToken: token, baseUrl: (override || (mode === "production" ? PROD_URL : SANDBOX_URL)).replace(/\/$/, ""), sandbox: mode === "sandbox" } };
}

export type AsaasPayment = {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  status: string;
  dueDate: string; // AAAA-MM-DD
  paymentDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  billingType?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
};
export type AsaasSubscription = { id: string; customer: string; status: string; value: number; nextDueDate?: string | null; deleted?: boolean; externalReference?: string | null };

type Fetch = typeof fetch;

async function call<T>(cfg: AsaasConfig, method: string, path: string, body?: unknown, f: Fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await f(`${cfg.baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", access_token: cfg.apiKey, "user-agent": "LegalOS/1.0" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch {
    throw new BillingProviderError("Não foi possível falar com o provedor de cobrança (rede ou tempo esgotado). Tente novamente em instantes.", null, true);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* corpo não é JSON */
  }
  if (!res.ok) {
    const errs = (json as { errors?: { description?: string }[] } | null)?.errors;
    const detail = errs?.map((e) => e.description).filter(Boolean).join("; ");
    if (res.status === 401) throw new BillingProviderError("O provedor de cobrança recusou a chave de acesso (ASAAS_API_KEY).", 401, false);
    throw new BillingProviderError(detail ? `Provedor de cobrança: ${detail}` : `O provedor de cobrança respondeu com erro ${res.status}.`, res.status, res.status >= 500 || res.status === 429);
  }
  return json as T;
}

export const asaas = {
  createCustomer: (cfg: AsaasConfig, d: { name: string; cpfCnpj: string; email: string; externalReference: string }, f?: Fetch) =>
    call<{ id: string }>(cfg, "POST", "/customers", { ...d, notificationDisabled: false }, f),
  /** billingType UNDEFINED: quem paga escolhe Pix, boleto ou cartão na página da fatura (nenhum dado de cartão passa pelo LegalOS). */
  updateCustomer: (cfg: AsaasConfig, id: string, d: { name: string; cpfCnpj: string; email: string }, f?: Fetch) =>
    call<{ id: string }>(cfg, "PUT", `/customers/${encodeURIComponent(id)}`, d, f),
  createSubscription: (cfg: AsaasConfig, d: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string }, f?: Fetch) =>
    call<AsaasSubscription>(cfg, "POST", "/subscriptions", { ...d, billingType: "UNDEFINED", cycle: "MONTHLY" }, f),
  updateSubscription: (cfg: AsaasConfig, id: string, d: { value: number; description: string }, f?: Fetch) =>
    call<AsaasSubscription>(cfg, "PUT", `/subscriptions/${encodeURIComponent(id)}`, { ...d, updatePendingPayments: true }, f),
  getSubscription: (cfg: AsaasConfig, id: string, f?: Fetch) => call<AsaasSubscription>(cfg, "GET", `/subscriptions/${encodeURIComponent(id)}`, undefined, f),
  deleteSubscription: (cfg: AsaasConfig, id: string, f?: Fetch) => call<{ deleted?: boolean }>(cfg, "DELETE", `/subscriptions/${encodeURIComponent(id)}`, undefined, f),
  getPayment: (cfg: AsaasConfig, id: string, f?: Fetch) => call<AsaasPayment>(cfg, "GET", `/payments/${encodeURIComponent(id)}`, undefined, f),
  /** Cobrança avulsa (honorários do escritório). billingType PIX ou BOLETO. */
  createPayment: (cfg: AsaasConfig, d: { customer: string; billingType: "PIX" | "BOLETO"; value: number; dueDate: string; description: string; externalReference: string }, f?: Fetch) =>
    call<AsaasPayment>(cfg, "POST", "/payments", d, f),
  deletePayment: (cfg: AsaasConfig, id: string, f?: Fetch) => call<{ deleted?: boolean }>(cfg, "DELETE", `/payments/${encodeURIComponent(id)}`, undefined, f),
  getPixQrCode: (cfg: AsaasConfig, id: string, f?: Fetch) => call<{ encodedImage: string; payload: string; expirationDate?: string }>(cfg, "GET", `/payments/${encodeURIComponent(id)}/pixQrCode`, undefined, f),
  findCustomerByReference: (cfg: AsaasConfig, ref: string, f?: Fetch) => call<{ data: { id: string }[] }>(cfg, "GET", `/customers?externalReference=${encodeURIComponent(ref)}&limit=1`, undefined, f),
  ping: (cfg: AsaasConfig, f?: Fetch) => call<{ data: unknown[] }>(cfg, "GET", "/customers?limit=1", undefined, f),
  listSubscriptionPayments: (cfg: AsaasConfig, id: string, f?: Fetch) =>
    call<{ data: AsaasPayment[] }>(cfg, "GET", `/subscriptions/${encodeURIComponent(id)}/payments?limit=20`, undefined, f),
};

export const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);
export const OVERDUE_STATUSES = new Set(["OVERDUE", "DUNNING_REQUESTED"]);
export const REVOKED_STATUSES = new Set(["REFUNDED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"]);

export type PaymentOutcome = "paid" | "overdue" | "revoked" | "pending";
export function paymentOutcome(status: string): PaymentOutcome {
  if (PAID_STATUSES.has(status)) return "paid";
  if (OVERDUE_STATUSES.has(status)) return "overdue";
  if (REVOKED_STATUSES.has(status)) return "revoked";
  return "pending";
}

/** AAAA-MM-DD + 1 mês (preserva o fim de mês: 31/01 → 28/02). */
export function addOneMonth(ymd: string): Date {
  const [y = 0, m = 1, d = 1] = ymd.split("-").map(Number);
  const target = new Date(Date.UTC(y, m, 1)); // primeiro dia do mês seguinte
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last), 23, 59, 59));
}

export const centsToReais = (c: number) => Math.round(c) / 100;
export const reaisToCents = (v: number) => Math.round(v * 100);
