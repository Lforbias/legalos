import { afterAll, describe, expect, it } from "vitest";
import { chromium, type BrowserContext, type Page, type Route } from "playwright-core";
import { loginEprocTjmg } from "@/lib/robots/eproc/login";
import { base32Encode, totpCode, totpStep, verifyTotp } from "@/lib/security/totp";

const ORIGIN = "https://eproc1g.tjmg.jus.br";
const SECRET = base32Encode(Buffer.from("12345678901234567890"));
const T0 = Date.UTC(2027, 0, 1, 12, 0, 5);
const browser = await chromium.launch({ args: ["--no-sandbox"] }).catch(() => null);
afterAll(async () => { await browser?.close(); });

const loginHtml = (error = "") => `<!doctype html><html><body>${error ? `<div class="alert-danger">${error}</div>` : ""}<form id="frmLogin" method="post" action="index.php" onsubmit="this.querySelector('input[name=pwdSenha]').value=document.querySelector('#pwdSenha').value"><input id="txtUsuario" name="txtUsuario"><input type="password" name="pwdSenha" hidden><input id="pwdSenha" type="text"><button type="submit" id="sbmEntrar">Entrar</button></form></body></html>`;
const otpHtml = (error = "") => `<!doctype html><html><body>${error ? `<div class="alert-danger">${error}</div>` : ""}<form method="post" action="index.php"><label for="txtCodigo">Código de autenticação</label><input id="txtCodigo" name="txtCodigo"><button id="btnValidar" type="submit">Validar</button></form></body></html>`;

async function fixture(fn: (page: Page, posts: string[]) => Promise<void>, invalidPassword = false, certificateLogin = false) {
  if (!browser) return;
  const context: BrowserContext = await browser.newContext();
  const posts: string[] = [];
  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== ORIGIN) return route.abort();
    if (request.method() === "GET" && url.pathname.endsWith("/certificate")) return route.fulfill({ status: 200, contentType: "text/html", body: otpHtml() });
    if (request.method() === "GET") return route.fulfill({ status: 200, contentType: "text/html", body: certificateLogin ? loginHtml() + `<a href="#help">Problemas de acesso com certificado?</a><input type="button" value="Certificado Digital" onclick="window.location.href='${ORIGIN}/certificate'">` : loginHtml() });
    const body = new URLSearchParams(request.postData() ?? "");
    if (body.get("hdnAcao") === "login" || body.get("txtUsuario")) {
      posts.push("login");
      if (invalidPassword || body.get("pwdSenha") !== "senha-valida") return route.fulfill({ status: 200, contentType: "text/html", body: loginHtml("Usuário ou senha inválidos.") });
      return route.fulfill({ status: 200, contentType: "text/html", body: otpHtml() });
    }
    posts.push("otp");
    const code = body.get("txtCodigo") ?? "";
    if (verifyTotp(SECRET, code, T0) !== null) return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body><h1>Painel do eproc</h1><nav id=menu-principal>Processos</nav></body></html>" });
    return route.fulfill({ status: 200, contentType: "text/html", body: otpHtml("Código inválido.") });
  });
  const page = await context.newPage();
  try { await fn(page, posts); } finally { await context.close(); }
}

const fakeClock = { now: T0 };
const credentials = { document: "usuario-teste", password: "senha-valida", otpSecret: SECRET };
const run = (page: Page) => {
  fakeClock.now = T0;
  return loginEprocTjmg(page, credentials, { now: () => fakeClock.now, sleep: async (ms) => { if (ms >= 1000) fakeClock.now += ms; else await new Promise((resolve) => setTimeout(resolve, ms)); }, stepTimeoutMs: 8_000 });
};

describe.skipIf(!browser)("login eproc TJMG", () => {
  it("envia usuário e senha e valida o TOTP antes de reconhecer a sessão", async () => {
    await fixture(async (page, posts) => {
      const result = await run(page);
      expect({ result, posts }).toMatchObject({ result: { ok: true }, posts: ["login", "otp"] });
      expect(posts).toEqual(["login", "otp"]);
      expect(totpCode(SECRET, totpStep(T0))).toHaveLength(6);
    });
  }, 15_000);

  it("entra por certificado e exige o TOTP sem enviar usuário ou senha", async () => {
    await fixture(async (page, posts) => {
      const result = await loginEprocTjmg(page, { document: "", password: "", otpSecret: SECRET, certificateAuth: true }, { now: () => T0, sleep: async () => undefined, stepTimeoutMs: 8_000 });
      expect(result).toMatchObject({ ok: true });
      expect(posts).toEqual(["otp"]);
    }, false, true);
  });

  it("senha recusada: não repete o envio", async () => {
    await fixture(async (page, posts) => {
      const result = await run(page);
      expect(result).toMatchObject({ ok: false, code: "BAD_CREDENTIALS", retryable: false });
      expect(posts).toEqual(["login"]);
    }, true);
  });
});
