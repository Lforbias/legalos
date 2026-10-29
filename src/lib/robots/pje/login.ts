import type { Page } from "playwright-core";
import { totpCode, totpStep, TOTP_PERIOD } from "@/lib/security/totp";
import { onlyDigits } from "@/lib/validation/br-documents";
import { sanitizeSignature, type PageSignature } from "./signature";
import { PJE_SSO_ORIGIN, pjeLoginUrl, type PjeTarget } from "./targets";

/**
 * Login no PJe pelo SSO do PDPJ (Keycloak): CPF/CNPJ + senha e, quando o portal pede, o código do 2º fator (TOTP).
 * Regras que não mudam: nunca repetir senha errada (bloqueia a conta), nunca resolver captcha, nunca adivinhar tela
 * desconhecida (para e devolve a "assinatura" da tela para diagnóstico).
 */
export type PjeCredentials = { document: string; password: string; otpSecret?: string | null };
export type LoginFailureCode = "BAD_CREDENTIALS" | "ACCOUNT_BLOCKED" | "OTP_NOT_CONFIGURED" | "OTP_MISSING" | "OTP_REJECTED" | "NEEDS_PERSON" | "UNKNOWN_PAGE" | "TIMEOUT" | "NETWORK";
export type LoginOutcome =
  | { ok: true; signature: PageSignature }
  | { ok: false; code: LoginFailureCode; message: string; retryable: boolean; signature: PageSignature | null; /** Causa técnica curta (ex.: net::ERR_CONNECTION_RESET), sem dados pessoais. */ detail?: string };
export type LoginOptions = {
  /** Palavras do nome da pessoa, retiradas das assinaturas de tela. */
  names?: string[];
  /** Passos TOTP já usados com esta credencial (o portal recusa o mesmo código duas vezes). Atualizado por esta função. */
  usedOtpSteps?: Set<number>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Tempo máximo de cada etapa (padrão 40 s). */
  stepTimeoutMs?: number;
};

type PageState = { kind: "LOGIN_FORM" | "OTP" | "OTP_SETUP" | "CAPTCHA" | "APP" | "UNKNOWN"; host: string; errorText: string };

/** Roda DENTRO da página: classifica a tela atual. Sem referências externas (é serializada). */
export const detectState = (ssoHost: string): PageState => {
  const vis = (el: Element | null): boolean => {
    if (!el) return false;
    const h = el as HTMLElement;
    const st = getComputedStyle(h);
    return st.display !== "none" && st.visibility !== "hidden" && (h.offsetWidth > 0 || h.offsetHeight > 0 || h.getClientRects().length > 0);
  };
  const any = (sel: string) => Array.from(document.querySelectorAll(sel)).some(vis);
  const errorText = Array.from(document.querySelectorAll(".alert-error, .alert-danger, .kc-feedback-text, #input-error, #input-error-username, #input-error-password, #input-error-otp-code, .pf-m-error, [role='alert']"))
    .filter(vis)
    .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" | ")
    .slice(0, 300);
  const host = location.host;
  if (host !== ssoHost) return { kind: host ? "APP" : "UNKNOWN", host, errorText };
  if (any("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, .h-captcha, [data-sitekey]")) return { kind: "CAPTCHA", host, errorText };
  if (any("#kc-totp-secret-key, #kc-totp-secret-qr-code, input[name='totp'], input#totp")) return { kind: "OTP_SETUP", host, errorText };
  if (any("input[name='otp'], input#otp")) return { kind: "OTP", host, errorText };
  if (any("#username") && any("#password")) return { kind: "LOGIN_FORM", host, errorText };
  return { kind: "UNKNOWN", host, errorText };
};

/** Roda DENTRO da página: só estrutura da tela, nenhum valor digitado. */
export const collectSignature = (): PageSignature => ({
  host: location.host,
  path: location.pathname,
  title: document.title,
  headings: Array.from(document.querySelectorAll("h1, h2, h3")).map((e) => (e.textContent || "").trim()).filter(Boolean).slice(0, 8),
  fields: Array.from(document.querySelectorAll("input, select, textarea")).map((e) => {
    const i = e as HTMLInputElement;
    return `${e.tagName.toLowerCase()}:${i.type || ""}:${i.name || i.id || ""}`;
  }).slice(0, 20),
  buttons: Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], a.btn")).map((e) => ((e as HTMLInputElement).value || e.textContent || "").trim()).filter(Boolean).slice(0, 12),
});

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const BLOCKED = /bloquead|excedeu|muitas tentativas|temporariamente|suspens/i;

async function state(page: Page): Promise<PageState | null> {
  try {
    return await page.evaluate(detectState, new URL(PJE_SSO_ORIGIN).host);
  } catch {
    return null; // a página estava navegando
  }
}

/** Espera até `until` ser verdadeiro para o estado da tela (ou esgotar o tempo). */
async function waitFor(page: Page, until: (s: PageState) => boolean, timeoutMs: number, sleep: (ms: number) => Promise<void>): Promise<PageState | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await state(page);
    if (s && until(s)) return s;
    await sleep(400);
  }
  return null;
}

export async function loginPje(page: Page, target: PjeTarget, creds: PjeCredentials, opts: LoginOptions = {}): Promise<LoginOutcome> {
  const names = opts.names ?? [];
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const timeout = opts.stepTimeoutMs ?? 40_000;
  const sig = async (): Promise<PageSignature | null> => {
    try {
      return sanitizeSignature(await page.evaluate(collectSignature), names);
    } catch {
      return null;
    }
  };
  const fail = async (code: LoginFailureCode, message: string, retryable: boolean, detail?: string): Promise<LoginOutcome> => ({ ok: false, code, message, retryable, signature: await sig(), ...(detail ? { detail } : {}) });

  try {
    await page.goto(pjeLoginUrl(target), { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const net = raw.match(/net::ERR_[A-Z_]+/)?.[0];
    const detail = net ?? (/timeout/i.test(raw) ? "tempo esgotado (45 s) ao abrir a página de login" : (raw.split("\n")[0] ?? "").slice(0, 160));
    return fail("NETWORK", "Não foi possível abrir o PJe do tribunal agora. O sistema tentará de novo.", true, detail);
  }

  let s = await waitFor(page, (x) => x.kind !== "UNKNOWN" || Boolean(x.errorText), 30_000, sleep);
  if (!s) return fail("TIMEOUT", "A tela de login do PJe não carregou a tempo.", true);
  if (s.kind === "CAPTCHA") return fail("NEEDS_PERSON", "O PJe pediu uma verificação de segurança (captcha). O LegalOS não resolve captcha: entre uma vez pelo navegador e tente de novo mais tarde.", false);
  if (s.kind !== "LOGIN_FORM") return fail("UNKNOWN_PAGE", "A tela de login do PJe está diferente do esperado. O robô parou para não errar.", false);

  await page.fill("#username", onlyDigits(creds.document));
  await page.fill("#password", creds.password);
  await page.click("#kc-login");

  s = await waitFor(page, (x) => x.kind !== "LOGIN_FORM" || Boolean(x.errorText), timeout, sleep);
  if (!s) return fail("TIMEOUT", "O PJe demorou demais para responder ao login.", true);
  if (s.kind === "LOGIN_FORM") {
    if (BLOCKED.test(s.errorText)) return fail("ACCOUNT_BLOCKED", "O PJe informou bloqueio ou excesso de tentativas. O LegalOS parou para não agravar. Aguarde e confira o acesso direto no portal.", false);
    return fail("BAD_CREDENTIALS", "O PJe recusou o CPF/CNPJ ou a senha. Corrija e tente de novo. O LegalOS não repete senha errada automaticamente.", false);
  }
  if (s.kind === "CAPTCHA") return fail("NEEDS_PERSON", "O PJe pediu uma verificação de segurança (captcha). O LegalOS não resolve captcha: entre uma vez pelo navegador e tente de novo mais tarde.", false);
  if (s.kind === "OTP_SETUP") return fail("OTP_NOT_CONFIGURED", "O PJe pediu para configurar o 2º fator (autenticador). Configure no portal e cadastre a chave aqui.", false);

  if (s.kind === "OTP") {
    if (!creds.otpSecret) return fail("OTP_MISSING", "O PJe pediu o código do 2º fator, mas a chave dele não está cadastrada.", false);
    const used = opts.usedOtpSteps ?? new Set<number>();
    let step = totpStep(now());
    const msLeft = (step + 1) * TOTP_PERIOD * 1000 - now();
    if (msLeft < 6_000 || used.has(step)) {
      await sleep(msLeft + 1_500);
      step = totpStep(now());
    }
    used.add(step);
    await page.fill("input[name='otp'], input#otp", totpCode(creds.otpSecret, step));
    const submit = page.locator("#kc-login");
    if (await submit.count()) await submit.first().click();
    else await page.keyboard.press("Enter");
    s = await waitFor(page, (x) => x.kind !== "OTP" || Boolean(x.errorText), timeout, sleep);
    if (!s) return fail("TIMEOUT", "O PJe demorou demais para responder ao código do 2º fator.", true);
    if (s.kind === "OTP") return fail("OTP_REJECTED", "O PJe recusou o código do 2º fator. Confira a chave cadastrada e o relógio do servidor.", false);
    if (s.kind === "CAPTCHA") return fail("NEEDS_PERSON", "O PJe pediu uma verificação de segurança (captcha). O LegalOS não resolve captcha.", false);
  }

  if (s.kind !== "APP") return fail("UNKNOWN_PAGE", "Depois do login o PJe mostrou uma tela inesperada. O robô parou para não errar.", false);
  await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => undefined);
  const final = await sig();
  return { ok: true, signature: final ?? { host: s.host, path: "", title: "", headings: [], fields: [], buttons: [] } };
}
