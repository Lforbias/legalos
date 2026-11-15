import type { Page } from "playwright-core";
import { totpCode, totpStep, TOTP_PERIOD } from "@/lib/security/totp";
import { sanitizeSignature, type PageSignature } from "../pje/signature";
import type { LoginOutcome, LoginProgress, PjeCredentials } from "../pje/login";
import type { EprocPortalTarget } from "./targets";

export const TJMG_EPROC_LOGIN_URL = "https://eproc1g.tjmg.jus.br/eproc/";
const BLOCKED = /bloquead|excedeu|muitas tentativas|temporariamente|suspens/i;

type EprocState = {
  kind: "LOGIN" | "OTP" | "OTP_SETUP" | "CAPTCHA" | "APP" | "UNKNOWN";
  host: string;
  errorText: string;
  otpSelector?: string;
  otpButton?: string;
  userSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
};

/** Classifica apenas a tela e seletores do desafio; não coleta valores dos campos. */
export const detectEprocState = ({ targetHost, ssoHost }: { targetHost: string; ssoHost?: string }): EprocState => {
  const OTP = /token|c[oó]digo|codigo|otp|totp|2fa|autentica[cç][aã]o/i;
  const visible = (el: Element) => {
    const h = el as HTMLElement;
    const style = getComputedStyle(h);
    return style.display !== "none" && style.visibility !== "hidden" && (h.offsetWidth > 0 || h.offsetHeight > 0 || h.getClientRects().length > 0);
  };
  const one = (selector: string) => Array.from(document.querySelectorAll(selector)).find(visible) ?? null;
  const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const errorText = Array.from(document.querySelectorAll(".alert-danger, .alert-error, .invalid-feedback, [role='alert'], .text-danger"))
    .filter(visible).map(text).filter(Boolean).join(" | ").slice(0, 300);
  const host = location.host;
  if (host !== targetHost && (!ssoHost || host !== ssoHost)) return { kind: "UNKNOWN", host, errorText };
  if (one("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, .h-captcha, [data-sitekey]")) return { kind: "CAPTCHA", host, errorText };
  const user = one("#txtUsuario[name='txtUsuario']");
  // TJMG eproc displays a name-less text field and keeps a hidden password input
  // with the submitted name; its official Submit('login') handler copies between them.
  const password = one("#pwdSenha");
  if (user && password) return { kind: "LOGIN", host, errorText, userSelector: "#txtUsuario", passwordSelector: "#pwdSenha", submitSelector: "#sbmEntrar" };
  if (one("#username") && one("#password")) return { kind: "LOGIN", host, errorText, userSelector: "#username", passwordSelector: "#password", submitSelector: "#kc-login" };

  const otpInput = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='password'])"))
    .find((el) => {
      const input = el as HTMLInputElement;
      const label = Array.from(document.querySelectorAll("label")).find((candidate) => candidate.htmlFor === input.id);
      return visible(el) && OTP.test(`${input.name} ${input.id} ${input.placeholder} ${text(label ?? null)}`);
    });
  if (otpInput) {
    const button = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']"))
      .find((el) => visible(el) && /validar|confirmar|entrar|continuar/i.test((el as HTMLInputElement).value || text(el)));
    const otpEl = otpInput as HTMLInputElement;
    const otpSelector = otpEl.id && /^[\w-]+$/.test(otpEl.id) ? `#${otpEl.id}` : otpEl.name && /^[\w-]+$/.test(otpEl.name) ? `input[name='${otpEl.name}']` : undefined;
    if (!otpSelector) return { kind: "UNKNOWN", host, errorText };
    return {
      kind: "OTP",
      host,
      errorText,
      otpSelector,
      otpButton: button && /^[\w-]+$/.test((button as HTMLInputElement).id) ? `#${(button as HTMLInputElement).id}` : undefined,
    };
  }
  if (/configur.{0,30}(2fa|dois fatores)|autentica[cç][aã]o em dois fatores/i.test(document.body.innerText)) return { kind: "OTP_SETUP", host, errorText };
  if (!one("#frmLogin") && !one("#pwdSenha") && document.body.innerText.trim().length > 0) return { kind: "APP", host, errorText };
  return { kind: "UNKNOWN", host, errorText };
};

const sleepDefault = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function loginEprocPortal(page: Page, target: EprocPortalTarget, creds: PjeCredentials, opts: {
  names?: string[];
  usedOtpSteps?: Set<number>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  stepTimeoutMs?: number;
  onProgress?: LoginProgress;
} = {}): Promise<LoginOutcome> {
  const sleep = opts.sleep ?? sleepDefault;
  const now = opts.now ?? Date.now;
  const timeout = opts.stepTimeoutMs ?? 30_000;
  const signature = async (): Promise<PageSignature | null> => {
    try {
      const s = await page.evaluate(() => ({
        host: location.host,
        path: location.pathname,
        title: document.title,
        headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((el) => (el.textContent ?? "").trim()).filter(Boolean).slice(0, 8),
        fields: Array.from(document.querySelectorAll("input,select,textarea")).map((el) => {
          const i = el as HTMLInputElement;
          return `${el.tagName.toLowerCase()}:${i.type || ""}:${i.name || i.id || ""}`;
        }).slice(0, 20),
        buttons: Array.from(document.querySelectorAll("button,input[type='submit'],input[type='button']")).map((el) => ((el as HTMLInputElement).value || el.textContent || "").trim()).filter(Boolean).slice(0, 12),
      }));
      return sanitizeSignature(s, opts.names ?? []);
    } catch { return null; }
  };
  const fail = async (code: Extract<LoginOutcome, { ok: false }>['code'], message: string, retryable: boolean): Promise<LoginOutcome> => {
    await opts.onProgress?.(message, code === "NEEDS_PERSON" || code === "OTP_NOT_CONFIGURED" || code === "OTP_MISSING" ? "WARN" : "ERROR");
    return { ok: false, code, message, retryable, signature: await signature() };
  };
  const readState = async () => {
    try {
      return await page.evaluate(detectEprocState, {
        targetHost: new URL(target.loginUrl).host,
        ...(target.ssoOrigin ? { ssoHost: new URL(target.ssoOrigin).host } : {}),
      });
    } catch { return null; }
  };
  const waitUntil = async (done: (state: EprocState) => boolean) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const s = await readState();
      if (s && done(s)) return s;
      await sleep(350);
    }
    return null;
  };

  try {
    await opts.onProgress?.(`Abrindo o portal oficial do ${target.courtCode}, ${target.degree}º grau (eproc).`);
    await page.goto(target.loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch {
    return fail("NETWORK", `Não foi possível abrir o eproc do ${target.courtCode} agora.`, true);
  }
  await opts.onProgress?.("Portal respondeu; identificando a etapa de autenticação.");
  let s = await waitUntil((state) => state.kind !== "UNKNOWN" || Boolean(state.errorText));
  if (!s) return fail("TIMEOUT", `A tela de acesso do eproc do ${target.courtCode} não carregou a tempo.`, true);
  if (s.kind === "CAPTCHA") return fail("NEEDS_PERSON", "O eproc pediu uma verificação de segurança. O LegalOS parou para você concluir no portal oficial.", false);
  if (creds.certificateAuth && s.kind === "LOGIN") {
    // O eproc TJMG implementa esta ação como <input type="button" value="Certificado Digital">.
    // getByText não encontra o value do input, e a página ainda contém links de ajuda com o mesmo texto.
    let certificateButton = page.getByRole("button", { name: /certificado\s+digital/i }).first();
    if (!(await certificateButton.count())) certificateButton = page.locator("input[type='button'][value*='Certificado' i], button:has-text('Certificado Digital'), a:has-text('Certificado Digital')").first();
    if (!(await certificateButton.count())) return fail("CERTIFICATE_REQUIRED", "O eproc não ofereceu autenticação por certificado no fluxo do navegador remoto.", false);
    await opts.onProgress?.("Selecionando a opção de entrada por certificado digital.");
    await certificateButton.click();
    s = await waitUntil((state) => state.kind !== "LOGIN" || Boolean(state.errorText));
    if (!s) return fail("TIMEOUT", "O eproc demorou para iniciar o login por certificado.", true);
    if (s.kind === "LOGIN") return fail("CERTIFICATE_REJECTED", "O eproc recusou o certificado digital.", false);
  }
  if (s.kind !== "LOGIN" && !(creds.certificateAuth && (s.kind === "OTP" || s.kind === "OTP_SETUP"))) return fail("UNKNOWN_PAGE", "A tela de acesso do eproc mudou; o LegalOS parou sem enviar os dados.", false);

  if (!creds.certificateAuth) {
    await opts.onProgress?.("Enviando a autenticação configurada; valores de acesso ficam ocultos.");
    await page.fill(s.userSelector!, creds.document);
    await page.fill(s.passwordSelector!, creds.password);
    await page.click(s.submitSelector!);
  }
  s = await waitUntil((state) => state.kind !== "LOGIN" || Boolean(state.errorText));
  if (!s) return fail("TIMEOUT", `O eproc do ${target.courtCode} demorou demais para responder ao login.`, true);
  if (s.kind === "LOGIN") {
    if (BLOCKED.test(s.errorText)) return fail("ACCOUNT_BLOCKED", "O eproc informou bloqueio ou excesso de tentativas. O LegalOS parou para não agravar.", false);
    return fail("BAD_CREDENTIALS", "O eproc recusou o usuário ou a senha. Confira os dados no portal oficial; o LegalOS não repetirá senha errada automaticamente.", false);
  }
  if (s.kind === "CAPTCHA") return fail("NEEDS_PERSON", "O eproc pediu uma verificação de segurança. O LegalOS parou para você concluir no portal oficial.", false);
  if (s.kind === "OTP_SETUP") return fail("OTP_NOT_CONFIGURED", "O eproc exige ativar a autenticação em dois fatores no portal antes do primeiro acesso.", false);
  if (s.kind === "OTP") {
    if (!creds.otpSecret) return fail("OTP_MISSING", "O eproc pediu o código de dois fatores, mas a chave do autenticador não está cadastrada.", false);
    await opts.onProgress?.("eproc solicitou o autenticador; gerando o código temporário. O código não aparece no terminal.");
    const used = opts.usedOtpSteps ?? new Set<number>();
    let step = totpStep(now());
    const remaining = (step + 1) * TOTP_PERIOD * 1000 - now();
    if (remaining < 6_000 || used.has(step)) {
      await sleep(remaining + 1_500);
      step = totpStep(now());
    }
    used.add(step);
    await opts.onProgress?.("Enviando o código temporário de forma protegida.");
    await page.fill(s.otpSelector!, totpCode(creds.otpSecret, step));
    if (s.otpButton) await page.click(s.otpButton);
    else await page.keyboard.press("Enter");
    await opts.onProgress?.("Código enviado; aguardando validação do portal.");
    s = await waitUntil((state) => state.kind !== "OTP" || Boolean(state.errorText));
    if (!s) return fail("TIMEOUT", "O eproc demorou demais para validar o código de dois fatores.", true);
    if (s.kind === "OTP") return fail("OTP_REJECTED", "O eproc recusou o código de dois fatores. Confira a chave cadastrada e o relógio do servidor.", false);
    if (s.kind === "CAPTCHA") return fail("NEEDS_PERSON", "O eproc pediu uma verificação de segurança. O LegalOS parou para você concluir no portal oficial.", false);
  }
  if (s.kind !== "APP" || new URL(page.url()).host !== new URL(target.loginUrl).host) return fail("UNKNOWN_PAGE", "O eproc mostrou uma etapa inesperada depois do login; o LegalOS não considera o acesso validado.", false);
  const final = await signature();
  await opts.onProgress?.("Login confirmado pelo portal; área autenticada detectada.", "SUCCESS");
  return { ok: true, signature: final ?? { host: s.host, path: "", title: "", headings: [], fields: [], buttons: [] } };
}

export async function loginEprocTjmg(page: Page, creds: PjeCredentials, opts: Parameters<typeof loginEprocPortal>[3] = {}): Promise<LoginOutcome> {
  const target: EprocPortalTarget = {
    key: "tjmg-1g",
    courtCode: "TJMG",
    degree: "1",
    label: "TJMG · 1º grau (eproc)",
    loginUrl: TJMG_EPROC_LOGIN_URL,
    source: "https://www.tjmg.jus.br",
  };
  return loginEprocPortal(page, target, creds, opts);
}
