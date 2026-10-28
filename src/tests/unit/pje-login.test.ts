import { afterAll, describe, expect, it } from "vitest";
import { chromium, type BrowserContext, type Page, type Route } from "playwright-core";
import { loginPje, type PjeCredentials } from "@/lib/robots/pje/login";
import { getPjeTarget } from "@/lib/robots/pje/targets";
import { base32Encode, totpCode, totpStep, verifyTotp } from "@/lib/security/totp";

/**
 * Testa o robô de login contra uma réplica do fluxo do SSO (Keycloak) montada com interceptação de rede: nada sai para a
 * internet. Precisa do Chromium do Playwright; sem ele o teste é pulado (rodamos no CI de E2E e no ambiente com navegador).
 */
const SSO = "https://sso.cloud.pje.jus.br";
const APP = "https://pje1g.trf1.jus.br";
const SECRET = base32Encode(Buffer.from("12345678901234567890"));
const T0 = Date.UTC(2027, 0, 1, 12, 0, 5); // 5 s depois do início de uma janela de 30 s

const browser = await chromium.launch({ args: ["--no-sandbox"] }).catch(() => null);
afterAll(async () => { await browser?.close(); });

type Scenario = { password: string; otp?: boolean; block?: boolean; captcha?: boolean };
const page = (body: string) => `<!doctype html><html><head><title>Entrar</title></head><body>${body}</body></html>`;
const loginPage = (err = "") => page(`<h1>Acesse sua conta</h1>${err ? `<span id="input-error" class="kc-feedback-text">${err}</span>` : ""}<form id="loginForm" method="post" action="${SSO}/auth/realms/pje/login-actions/authenticate?step=login"><input id="username" name="username" type="text"><input id="password" name="password" type="password"><input id="kc-login" type="submit" value="Entrar"></form>`);
const otpPage = (err = "") => page(`<h1>Código de verificação</h1>${err ? `<span class="kc-feedback-text">${err}</span>` : ""}<form method="post" action="${SSO}/auth/realms/pje/login-actions/authenticate?step=otp"><input id="otp" name="otp" type="text"><input id="kc-login" type="submit" value="Entrar"></form>`);

async function withFixture<T>(sc: Scenario, fn: (page: Page, log: { posts: string[] }) => Promise<T>): Promise<T> {
  const ctx: BrowserContext = await browser!.newContext();
  const log = { posts: [] as string[] };
  await ctx.route("**/*", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const html = (body: string) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
    // redirecionamento por página (o Chromium não passa 302 fabricado pela interceptação de novo; assim cada destino também é interceptado)
    const redirect = (to: string) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: `<!doctype html><title>Redirecionando</title><script>location.replace(${JSON.stringify(to)})</script>` });
    if (url.origin === APP && url.pathname === "/pje/login.seam") return redirect(`${SSO}/auth/realms/pje/protocol/openid-connect/auth?client_id=pje-trf1-1g`);
    if (url.origin === APP) return html(page("<h1>Painel do usuário</h1>"));
    if (url.origin !== SSO) return route.abort();
    if (req.method() === "GET") return html(sc.captcha ? page(`<h1>Verificação</h1><div class="g-recaptcha" data-sitekey="x" style="width:300px;height:80px">captcha</div>`) : loginPage());
    const form = new URLSearchParams(req.postData() ?? "");
    log.posts.push(url.searchParams.get("step") ?? "?");
    if (url.searchParams.get("step") === "otp") return verifyTotp(SECRET, form.get("otp") ?? "", clock.now) !== null ? redirect(`${APP}/pje/home.seam`) : html(otpPage("Código inválido."));
    if (sc.block) return html(loginPage("Conta temporariamente bloqueada por excesso de tentativas."));
    if (form.get("password") !== sc.password) return html(loginPage("Usuário ou senha inválidos."));
    return sc.otp ? html(otpPage()) : redirect(`${APP}/pje/home.seam`);
  });
  const p = await ctx.newPage();
  try {
    return await fn(p, log);
  } finally {
    await ctx.close();
  }
}

const clock = { now: T0 };
const sleep = async (ms: number) => { if (ms >= 1000) clock.now += ms; else await new Promise((r) => setTimeout(r, ms)); };
const target = getPjeTarget("trf1-1g")!;
const creds = (over: Partial<PjeCredentials> = {}): PjeCredentials => ({ document: "123.456.789-09", password: "segredo", otpSecret: null, ...over });
const run = (p: Page, c: PjeCredentials, steps = new Set<number>()) => { clock.now = T0; return loginPje(p, target, c, { names: ["Talita"], usedOtpSteps: steps, now: () => clock.now, sleep, stepTimeoutMs: 8_000 }); };

describe.skipIf(!browser)("robô de login do PJe (réplica do SSO)", () => {
  it("entra com CPF e senha", async () => {
    await withFixture({ password: "segredo" }, async (p) => {
      const r = await run(p, creds());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.signature.host).toBe("pje1g.trf1.jus.br");
    });
  });

  it("senha errada: para na primeira tentativa, sem repetir", async () => {
    await withFixture({ password: "outra" }, async (p, log) => {
      const r = await run(p, creds());
      expect(r).toMatchObject({ ok: false, code: "BAD_CREDENTIALS", retryable: false });
      expect(log.posts).toEqual(["login"]);
    });
  });

  it("conta bloqueada: para e avisa", async () => {
    await withFixture({ password: "segredo", block: true }, async (p) => {
      expect(await run(p, creds())).toMatchObject({ ok: false, code: "ACCOUNT_BLOCKED", retryable: false });
    });
  });

  it("captcha: não resolve, pede a pessoa", async () => {
    await withFixture({ password: "segredo", captcha: true }, async (p, log) => {
      expect(await run(p, creds())).toMatchObject({ ok: false, code: "NEEDS_PERSON", retryable: false });
      expect(log.posts).toEqual([]);
    });
  });

  it("2º fator: calcula o código e entra", async () => {
    await withFixture({ password: "segredo", otp: true }, async (p, log) => {
      const steps = new Set<number>();
      const r = await run(p, creds({ otpSecret: SECRET }), steps);
      expect(r.ok).toBe(true);
      expect(log.posts).toEqual(["login", "otp"]);
      expect(steps.has(totpStep(T0))).toBe(true);
    });
  });

  it("2º fator pedido sem chave cadastrada", async () => {
    await withFixture({ password: "segredo", otp: true }, async (p) => {
      expect(await run(p, creds())).toMatchObject({ ok: false, code: "OTP_MISSING" });
    });
  });

  it("2º fator com chave errada é recusado (uma só tentativa)", async () => {
    await withFixture({ password: "segredo", otp: true }, async (p, log) => {
      const r = await run(p, creds({ otpSecret: base32Encode(Buffer.from("outra-chave-qualquer!")) }));
      expect(r).toMatchObject({ ok: false, code: "OTP_REJECTED" });
      expect(log.posts).toEqual(["login", "otp"]);
    });
  });

  it("não reaproveita o mesmo passo do código: espera a janela seguinte", async () => {
    await withFixture({ password: "segredo", otp: true }, async (p) => {
      const steps = new Set<number>([totpStep(T0)]);
      const r = await run(p, creds({ otpSecret: SECRET }), steps);
      expect(r.ok).toBe(true);
      expect(steps.has(totpStep(T0) + 1)).toBe(true);
      expect(totpCode(SECRET, totpStep(T0))).not.toBe(totpCode(SECRET, totpStep(T0) + 1));
    });
  });

  it("assinatura de diagnóstico não carrega CPF nem nome", async () => {
    await withFixture({ password: "outra" }, async (p) => {
      const r = await run(p, creds({ document: "123.456.789-09" }));
      expect(JSON.stringify(r)).not.toMatch(/123\.?456\.?789|Talita/i);
    });
  });
});
