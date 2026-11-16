import { afterAll, describe, expect, it } from "vitest";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { detectEprocState, loginEprocPortal, loginEprocTjmg } from "@/lib/robots/eproc/login";
import { pageSerializable } from "@/lib/robots/pje/signature";
import { observeEprocPanel } from "@/lib/robots/eproc/panel";
import { getTjmgReportLink, readTjmgReport } from "@/lib/robots/eproc/report";
import { EPROC_PORTAL_TARGETS, eprocAllowedOrigins, getEprocPortalTarget, type EprocPortalTarget } from "@/lib/robots/eproc/targets";
import { base32Encode, totpCode, totpStep, verifyTotp } from "@/lib/security/totp";

const ORIGIN = "https://eproc1g.tjmg.jus.br";
const EPROC = `${ORIGIN}/eproc`;
/** SSO oficial do catálogo do TJSP; só serve aqui para provar o redirecionamento para uma segunda origem permitida. */
const SSO = "https://sso.tjsp.jus.br";
const CERT_SSO = "https://certificado-sso.tjsp.jus.br";
const FOREIGN = "https://portal-falso.example.com";
const SECRET = base32Encode(Buffer.from("12345678901234567890"));
const T0 = Date.UTC(2027, 0, 1, 12, 0, 5);
const browser = await chromium.launch({ args: ["--no-sandbox"] }).catch(() => null);
afterAll(async () => { await browser?.close(); });

/* ---------- páginas simuladas (a estrutura espelha a tela pública real do eproc TJMG) ---------- */

const loginHtml = (opts: { error?: string; certAction?: string | null; slowModal?: boolean } = {}) => `<!doctype html><html><head><title>:: eproc - :: Sistema Eproc :: ::</title></head><body>${opts.error ? `<div class="alert-danger">${opts.error}</div>` : ""}<form id="frmLogin" name="frmLogin" method="post" action="index.php" onsubmit="this.querySelector('input[name=pwdSenha]').value=document.querySelector('#pwdSenha').value"><input id="txtUsuario" name="txtUsuario"><input type="password" name="pwdSenha" hidden><input id="pwdSenha" type="text"><button type="submit" id="sbmEntrar">Entrar</button>${opts.certAction === null ? "" : `<input type="button" value="Certificado Digital" onclick="${opts.certAction ?? "SubmitCert()"}"><input type="hidden" id="destino_v2_cert" name="destino_v2_cert" value="${EPROC}/externo_controlador.php?acao=login_cert"><input type="hidden" name="hdnAcao" value="login">`}</form><a id="problemasCertificado" href="#help">Problemas de acesso com certificado?</a><script>function SubmitCert(){var f=document.getElementById('frmLogin');f.action=document.getElementById('destino_v2_cert').value;${opts.slowModal ? "setTimeout(function(){var i=document.createElement('iframe');i.src='externo_controlador.php?acao=erro_carregar_certificado_digital';document.body.appendChild(i);},500);" : ""}f.submit();}</script></body></html>`;
const otpHtml = (error = "", action = "index.php") => `<!doctype html><html><head><title>:: eproc - Autenticação ::</title></head><body>${error ? `<div class="alert-danger">${error}</div>` : ""}<form method="post" action="${action}"><label for="txtCodigo">Código de autenticação</label><input id="txtCodigo" name="txtCodigo"><button id="btnValidar" type="submit">Validar</button></form></body></html>`;
const appHtml = `<!doctype html><html><head><title>:: eproc - Painel ::</title></head><body><nav id="menu-principal">Processos</nav><a href="controlador.php?acao=logout">Sair</a><h1>Painel do eproc</h1></body></html>`;
const publicHtml = `<!doctype html><html><head><title>:: eproc - Consulta pública ::</title></head><body><h1>Consulta Pública de Processos</h1><a href="externo_controlador.php?acao=processo_consulta_publica">Consultar</a></body></html>`;
const frameShellHtml = `<!doctype html><html><head><title>:: eproc ::</title></head><body><h1>Autenticação em dois fatores</h1><iframe id="subfrm" src="externo_controlador.php?acao=token_subfrm"></iframe></body></html>`;
const slowCertificateHtml = `<!doctype html><html><head><title>:: eproc - O acesso ao seu certificado digital está demorando mais do que normal ::</title></head><body><p>Os seguintes passos são sugeridos.</p></body></html>`;
const certificateErrorHtml = `<!doctype html><html><head><title>:: eproc - Não foi possível validar o seu certificado digital ::</title></head><body><p>Informação: os seguintes passos são sugeridos.</p></body></html>`;
const captchaHtml = `<!doctype html><html><head><title>:: eproc ::</title></head><body><h1>Verificação de segurança</h1><div class="g-recaptcha" data-sitekey="chave-publica-de-teste" style="width:300px;height:80px"></div></body></html>`;
const maintenanceHtml = `<!doctype html><html><head><title>Manutenção 0001234-56.2024.8.13.0024 — TALITA</title></head><body><h1>Sistema em manutenção</h1><input name="txtPrefill" value="SEGREDO-ABC123"><input type="button" value="Voltar"></body></html>`;
const foreignOtpHtml = `<!doctype html><html><body><h1>Login</h1><label for="txtCodigo">Código</label><input id="txtCodigo" name="txtCodigo"><button id="btnValidar" type="submit">Validar</button></body></html>`;
const eprocPanelHtml = `<!doctype html><html><head><title>Painel do Advogado</title></head><body><table><tr><td>Processos com prazo em aberto</td><td>4</td></tr><tr><td>Processos pendentes de citação/intimação</td><td>2</td></tr></table><a href="${EPROC}/controlador.php?acao=relacao_processos&num_processo_bi=123456789">Relação de Processos</a><a href="${EPROC}/controlador.php?acao=ultimas_movimentacoes">Últimas Movimentações</a></body></html>`;

type Reply = { status?: number; body?: string; delayMs?: number };
type Log = { posts: string[]; certForms: URLSearchParams[]; otpHosts: string[]; foreignPosts: string[]; requests: string[] };
type FixtureOptions = {
  /** O que o eproc responde ao POST de `acao=login_cert` (padrão: a tela do código de dois fatores). */
  afterCert?: Reply;
  /** Rotas extras (têm prioridade sobre as padrão). */
  handler?: (url: URL, method: string) => Reply | undefined;
  abort?: (url: URL, method: string) => boolean;
  login?: Parameters<typeof loginHtml>[0];
  invalidPassword?: boolean;
};

/**
 * Redirecionamento feito pela própria página (JS). Evita `route.fulfill` com 302: o Chromium segue esse redirecionamento pela
 * rede de verdade, e o teste acabaria tocando o portal real.
 */
const redirect = (location: string): Reply => ({ body: `<!doctype html><html><body><p>Redirecionando…</p><script>location.replace(${JSON.stringify(location)})</script></body></html>` });

async function fixture(fn: (page: Page, log: Log) => Promise<void>, options: FixtureOptions = {}) {
  if (!browser) return;
  const context: BrowserContext = await browser.newContext();
  const log: Log = { posts: [], certForms: [], otpHosts: [], foreignPosts: [], requests: [] };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    log.requests.push(`${method} ${url.host}${url.pathname}`);
    if (options.abort?.(url, method)) return route.abort("connectionfailed");
    const form = new URLSearchParams(request.postData() ?? "");
    let reply: Reply | undefined = options.handler?.(url, method);
    if (!reply && method === "POST" && url.origin === FOREIGN) log.foreignPosts.push(url.pathname);
    if (!reply && [ORIGIN, SSO, CERT_SSO].includes(url.origin)) {
      if (method === "GET" && url.pathname === "/eproc/") reply = { body: loginHtml(options.login) };
      else if (method === "GET" && url.pathname === "/eproc/controlador.php") reply = { body: appHtml };
      else if (method === "GET" && url.searchParams.get("acao") === "token") reply = { body: otpHtml() };
      else if (method === "GET" && url.searchParams.get("acao") === "token_subfrm") reply = { body: otpHtml("", "externo_controlador.php?acao=token_validar") };
      else if (method === "GET" && url.searchParams.get("acao") === "erro_carregar_certificado_digital") reply = { body: slowCertificateHtml };
      else if (method === "GET" && url.searchParams.get("acao") === "erro_certificado_digital") reply = { body: certificateErrorHtml };
      else if (method === "GET" && [SSO, CERT_SSO].includes(url.origin) && url.pathname === "/auth/otp") reply = { body: otpHtml("", `${url.origin}/auth/otp`) };
      else if (method === "POST" && url.searchParams.get("acao") === "login_cert") {
        log.posts.push("cert");
        log.certForms.push(form);
        reply = options.afterCert ?? { body: otpHtml() };
      } else if (method === "POST" && form.has("txtCodigo")) {
        log.posts.push("otp");
        log.otpHosts.push(url.host);
        if (verifyTotp(SECRET, form.get("txtCodigo") ?? "", T0) === null) reply = { body: otpHtml("Código inválido.") };
        else if (url.searchParams.get("acao") === "token_validar") reply = { body: `<!doctype html><script>top.location.href='${EPROC}/controlador.php?acao=principal'</script>` };
        else reply = redirect(`${EPROC}/controlador.php?acao=principal`);
      } else if (method === "POST") {
        log.posts.push("login");
        reply = options.invalidPassword || form.get("pwdSenha") !== "senha-valida" ? { body: loginHtml({ error: "Usuário ou senha inválidos." }) } : { body: otpHtml() };
      }
    }
    if (!reply) return route.abort();
    if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    return route.fulfill({ status: reply.status ?? 200, contentType: "text/html; charset=utf-8", body: reply.body ?? "" });
  });
  const page = await context.newPage();
  try { await fn(page, log); } finally { await context.close(); }
}

/* ---------- helpers de execução ---------- */

const clock = { now: T0 };
const sleep = async (ms: number) => { if (ms >= 1000) clock.now += ms; else await new Promise((resolve) => setTimeout(resolve, ms)); };
const base = () => { clock.now = T0; return { now: () => clock.now, sleep, stepTimeoutMs: 8_000, settleMs: 1_200 }; };
const credentials = { document: "usuario-teste", password: "senha-valida", otpSecret: SECRET };
const certCredentials = { document: "", password: "", otpSecret: SECRET, certificateAuth: true };
const run = (page: Page) => loginEprocTjmg(page, credentials, base());
function runCertificate(page: Page, extra: Record<string, unknown> = {}) {
  const events: string[] = [];
  const result = loginEprocTjmg(page, certCredentials, { ...base(), ...extra, onProgress: (message) => { events.push(message); } } as Parameters<typeof loginEprocTjmg>[2]);
  return result.then((outcome) => ({ outcome, events, why: outcome.ok ? "ok" : `${outcome.code}: ${outcome.message} | terminal: ${events.slice(-8).join(" / ")}` }));
}
const sso = () => ({ ...getEprocPortalTarget("tjsp-1g")!, loginUrl: `${EPROC}/` }) satisfies EprocPortalTarget;

describe.skipIf(!browser)("login eproc TJMG", () => {
  it("lê o relatório vinculado à sessão sem abrir autos ou registrar ciência", async () => {
    const context = await browser!.newContext();
    try {
      const page = await context.newPage();
      const requests: string[] = [];
      const action = "relatorio_processo_procurador_listar";
      await context.route(`${EPROC}/**`, async (route) => {
        const url = new URL(route.request().url());
        const operation = url.searchParams.get("acao") ?? "";
        requests.push(operation);
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: operation === action
          ? "<table><tr><th>Número Processo</th><th>Último Evento</th><th>Data/Hora Ult. Evento</th></tr><tr><td><a href='?acao=abrir_prazo'>1234567-<br>00.2026.8.13.0001</a></td><td>Juntada</td><td>16/11/2026 12:00</td></tr></table>"
          : `<a href='?acao=abrir_prazo'>Relação de Processos</a><a href='?acao=${action}&amp;hash=ficticio'>Relação de Processos</a>` });
      });
      await page.goto(`${EPROC}/controlador.php?acao=painel_adv_listar`);
      const link = await getTjmgReportLink(page);
      expect(link).toContain("hash=ficticio");
      expect(await readTjmgReport(page, link!)).toEqual({
        recognized: true, truncated: false,
        rows: [{ processNumber: "1234567-00.2026.8.13.0001", event: "Juntada", eventDate: "16/11/2026 12:00" }],
      });
      expect(requests).toEqual(["painel_adv_listar", action]);
      expect(context.pages()).toEqual([page]);
    } finally {
      await context.close();
    }
  });

  it("classifica o formulário dentro do Chromium sem depender do runtime Node", async () => {
    await fixture(async (page) => {
      await page.goto(`${EPROC}/`, { waitUntil: "domcontentloaded" });
      const state = await page.evaluate(pageSerializable(detectEprocState), { targetHost: new URL(ORIGIN).host });
      expect(state.kind).toBe("LOGIN");
    });
  });

  it("envia usuário e senha e valida o TOTP antes de reconhecer a sessão", async () => {
    await fixture(async (page, log) => {
      const result = await run(page);
      expect({ result, posts: log.posts }).toMatchObject({ result: { ok: true }, posts: ["login", "otp"] });
      expect(log.posts).toEqual(["login", "otp"]);
      expect(totpCode(SECRET, totpStep(T0))).toHaveLength(6);
    });
  }, 15_000);

  it("senha recusada: não repete o envio", async () => {
    await fixture(async (page, log) => {
      const result = await run(page);
      expect(result).toMatchObject({ ok: false, code: "BAD_CREDENTIALS", retryable: false });
      expect(log.posts).toEqual(["login"]);
    }, { invalidPassword: true });
  });

  describe("depois do clique em Certificado Digital", () => {
    it("o botão real (SubmitCert) vai ao login_cert no mesmo host, sem usuário/senha, e o TOTP fecha o acesso", async () => {
      await fixture(async (page, log) => {
        const { outcome, events, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: true });
        expect(log.posts).toEqual(["cert", "otp"]);
        expect(log.requests.filter((r) => r.startsWith("POST")).every((r) => r.includes("eproc1g.tjmg.jus.br"))).toBe(true);
        expect(log.certForms[0]!.get("txtUsuario") ?? "").toBe("");
        expect(log.certForms[0]!.getAll("pwdSenha").join("")).toBe("");
        expect(events).toContain("Selecionando a opção de entrada por certificado digital.");
        expect(events.some((message) => message.includes("gerando o código temporário"))).toBe(true);
        expect(events.at(-1)).toContain("Login confirmado pelo portal");
        expect(events.join(" ")).not.toContain(totpCode(SECRET, totpStep(T0)));
        expect(events.join(" ")).not.toContain(SECRET);
      });
    }, 20_000);

    it("aceita a área autenticada quando o portal entra direto, sem pedir o código", async () => {
      await fixture(async (page, log) => {
        const { outcome, events, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: true });
        expect(log.posts).toEqual(["cert"]);
        expect(events.some((message) => message.includes("gerando o código temporário"))).toBe(false);
        expect(events.at(-1)).toContain("Login confirmado pelo portal");
      }, { afterCert: redirect(`${EPROC}/controlador.php?acao=principal`) });
    }, 20_000);

    it("encontra o código de dois fatores em um modal (iframe) aberto depois do certificado", async () => {
      await fixture(async (page, log) => {
        const { outcome, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: true });
        expect(log.posts).toEqual(["cert", "otp"]);
      }, { afterCert: { body: frameShellHtml } });
    }, 20_000);

    it("segue o código de dois fatores em outra origem oficial e volta para o eproc", async () => {
      await fixture(async (page, log) => {
        const events: string[] = [];
        const outcome = await loginEprocPortal(page, sso(), certCredentials, { ...base(), onProgress: (message) => { events.push(message); } });
        expect(outcome, outcome.ok ? "ok" : `${outcome.code}: ${outcome.message} | terminal: ${events.slice(-8).join(" / ")}`).toMatchObject({ ok: true });
        expect(log.posts).toEqual(["cert", "otp"]);
        expect(log.otpHosts).toEqual(["sso.tjsp.jus.br"]);
      }, { afterCert: redirect(`${SSO}/auth/otp`) });
    }, 20_000);

    it("segue uma nova aba aberta no domínio oficial", async () => {
      await fixture(async (page, log) => {
        const { outcome, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: true });
        expect(log.posts).toEqual(["otp"]);
      }, { login: { certAction: `window.open('${EPROC}/externo_controlador.php?acao=token')` } });
    }, 20_000);

    it("espera uma tela intermediária lenta em vez de desistir", async () => {
      await fixture(async (page, log) => {
        const { outcome, why } = await runCertificate(page, { settleMs: 3_000 });
        expect(outcome, why).toMatchObject({ ok: true });
        expect(log.posts).toEqual(["cert", "otp"]);
      }, { afterCert: { body: `<!doctype html><html><body><p>Aguarde, validando o certificado…</p><script>setTimeout(function(){location.replace('${EPROC}/externo_controlador.php?acao=token')},1500)</script></body></html>` } });
    }, 20_000);

    it("avisa que o eproc está lento para ler o certificado, sem falhar", async () => {
      await fixture(async (page) => {
        const { outcome, events, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: true });
        expect(events.some((message) => message.includes("demorando")), events.join(" / ")).toBe(true);
      }, { login: { slowModal: true }, afterCert: { body: otpHtml(), delayMs: 2_200 } });
    }, 20_000);

    it("pede uma pessoa quando aparece captcha depois do certificado", async () => {
      await fixture(async (page, log) => {
        const { outcome, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: false, code: "NEEDS_PERSON", retryable: false });
        expect(log.posts).toEqual(["cert"]);
      }, { afterCert: { body: captchaHtml } });
    }, 20_000);

    it.each([
      ["página inteira", { body: certificateErrorHtml }],
      ["modal sobre a tela de acesso", { body: loginHtml({ certAction: null }).replace("</body>", `<iframe src="externo_controlador.php?acao=erro_certificado_digital"></iframe></body>`) }],
    ])("recusa o certificado quando o eproc informa que não conseguiu validar (%s)", async (_label, reply) => {
      await fixture(async (page, log) => {
        const { outcome, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: false, code: "CERTIFICATE_REJECTED", retryable: false });
        expect(log.posts).toEqual(["cert"]);
      }, { afterCert: reply });
    }, 20_000);

    it("não trata a área pública do eproc como login válido", async () => {
      await fixture(async (page) => {
        const { outcome, events, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: false, code: "UNKNOWN_PAGE", retryable: false });
        expect(events.join(" ")).not.toContain("Login confirmado");
      }, { afterCert: redirect(`${EPROC}/externo_controlador.php?acao=principal`), handler: (url) => (url.pathname === "/eproc/externo_controlador.php" && url.searchParams.get("acao") === "principal" ? { body: publicHtml } : undefined) });
    }, 20_000);

    it("para quando o redirecionamento sai da lista oficial e não envia nada ao outro host", async () => {
      await fixture(async (page, log) => {
        const { outcome, events, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: false, code: "UNKNOWN_PAGE", retryable: false });
        expect(outcome.ok ? "" : outcome.message).toContain("portal-falso.example.com");
        expect(log.posts).toEqual(["cert"]);
        expect(log.foreignPosts).toEqual([]);
        expect(events.some((message) => message.includes("Enviando o código"))).toBe(false);
        expect(events.join("\n")).toContain("Diagnóstico da tela");
      }, { afterCert: redirect(`${FOREIGN}/sso`), handler: (url) => (url.origin === FOREIGN ? { body: foreignOtpHtml } : undefined) });
    }, 20_000);

    it("para quando uma nova aba abre fora da lista oficial", async () => {
      await fixture(async (page, log) => {
        const { outcome, why } = await runCertificate(page);
        expect(outcome, why).toMatchObject({ ok: false, code: "UNKNOWN_PAGE", retryable: false });
        expect(outcome.ok ? "" : outcome.message).toContain("portal-falso.example.com");
        expect(log.posts).toEqual([]);
        expect(log.foreignPosts).toEqual([]);
      }, { login: { certAction: `window.open('${FOREIGN}/sso')` }, handler: (url) => (url.origin === FOREIGN ? { body: foreignOtpHtml } : undefined) });
    }, 20_000);

    it("tela inesperada: para e mostra um diagnóstico sanitizado no terminal", async () => {
      await fixture(async (page, log) => {
        const { outcome, events, why } = await runCertificate(page, { names: ["Talita", "Silva"] });
        expect(outcome, why).toMatchObject({ ok: false, code: "UNKNOWN_PAGE", retryable: false });
        expect(log.posts).toEqual(["cert"]);
        const terminal = events.join("\n");
        expect(terminal).toContain("Diagnóstico da tela");
        expect(terminal).toContain("eproc1g.tjmg.jus.br/eproc/externo_controlador.php");
        expect(terminal).toContain("txtPrefill");
        expect(terminal).toContain("Voltar");
        expect(terminal).not.toMatch(/SEGREDO-ABC123|segredo-hash|hash=|0001234|TALITA|Talita/);
        const stored = JSON.stringify(outcome.ok ? null : outcome.signature);
        expect(stored).toContain("txtPrefill");
        expect(stored).not.toMatch(/SEGREDO-ABC123|segredo-hash|hash=|0001234|TALITA/i);
      }, { afterCert: redirect(`${EPROC}/externo_controlador.php?acao=manutencao&hash=segredo-hash`), handler: (url) => (url.pathname === "/eproc/externo_controlador.php" && url.searchParams.get("acao") === "manutencao" ? { body: maintenanceHtml } : undefined) });
    }, 20_000);

    it("identifica falha de navegação TLS do navegador sem tratá-la como redirecionamento externo", async () => {
      await fixture(async (page) => {
        const { outcome, events } = await runCertificate(page);
        expect(outcome).toMatchObject({ ok: false, code: "UNKNOWN_PAGE" });
        expect(outcome.ok ? "" : outcome.message).toMatch(/eproc1g\.tjmg\.jus\.br.*ERR_CONNECTION_FAILED/i);
        expect(outcome.ok ? "" : outcome.message).not.toMatch(/não está na lista oficial/i);
        expect(events.join("\n")).toContain("Diagnóstico da tela");
      }, { abort: (url, method) => method === "POST" && url.searchParams.get("acao") === "login_cert" });
    }, 20_000);
  });

  describe("classificação das telas", () => {
    const cases: [string, string, string, string][] = [
      ["área autenticada (controlador interno + Sair)", "/eproc/controlador.php", appHtml, "APP"],
      ["área pública com texto, sem evidência de sessão", "/eproc/externo_controlador.php", publicHtml, "UNKNOWN"],
      ["código em campo mascarado (type=password)", "/eproc/externo_controlador.php", `<html><body><label for="txtToken">Token de segurança</label><input id="txtToken" type="password"><button id="btnConfirmar">Confirmar</button></body></html>`, "OTP"],
      ["código só com autocomplete=one-time-code", "/eproc/externo_controlador.php", `<html><body><p>Informe o valor</p><input type="text" autocomplete="one-time-code"></body></html>`, "OTP"],
      ["página de erro do certificado", "/eproc/externo_controlador.php", certificateErrorHtml, "CERT_ERROR"],
      ["tela em branco", "/eproc/externo_controlador.php", `<html><body></body></html>`, "UNKNOWN"],
    ];
    it.each(cases)("%s", async (_name, path, body, kind) => {
      await fixture(async (page) => {
        await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
        const state = await page.evaluate(pageSerializable(detectEprocState), { targetHost: new URL(ORIGIN).host });
        expect(state.kind).toBe(kind);
        if (kind === "OTP") expect(state.otpSelector).toBeTruthy();
      }, { handler: (url) => (url.pathname === path ? { body } : undefined) });
    });

    it("host fora da lista é UNKNOWN; about:blank ainda é só espera", async () => {
      await fixture(async (page) => {
        await page.goto("about:blank");
        expect((await page.evaluate(pageSerializable(detectEprocState), { targetHost: new URL(ORIGIN).host })).kind).toBe("WAIT");
        await page.goto(`${FOREIGN}/sso`);
        expect((await page.evaluate(pageSerializable(detectEprocState), { targetHost: new URL(ORIGIN).host })).kind).toBe("UNKNOWN");
        await page.goto(`${FOREIGN}/sso`);
        expect((await page.evaluate(pageSerializable(detectEprocState), { targetHost: new URL(ORIGIN).host, allowedHosts: [new URL(FOREIGN).host] })).kind).not.toBe("UNKNOWN");
      }, { handler: (url) => (url.origin === FOREIGN ? { body: foreignOtpHtml } : undefined) });
    });
  });
});

describe("origens oficiais do fluxo eproc", () => {
  it("TJMG: o certificado e o login usam só o host do próprio eproc (confirmado em destino_v2_cert)", () => {
    expect(eprocAllowedOrigins(getEprocPortalTarget("tjmg-1g")!)).toEqual(["https://eproc1g.tjmg.jus.br"]);
  });

  it("inclui o SSO oficial quando o tribunal usa um", () => {
    expect(eprocAllowedOrigins(getEprocPortalTarget("tjsp-1g")!)).toEqual(["https://eproc1g.tjsp.jus.br", "https://sso.tjsp.jus.br", CERT_SSO]);
  });

  it("TJSP: acompanha o host de certificado apontado pelo botão oficial do SSO", async () => {
    await fixture(async (page, log) => {
      const events: string[] = [];
      const outcome = await loginEprocPortal(page, sso(), certCredentials, { ...base(), onProgress: (message) => { events.push(message); } });
      expect(outcome, events.join(" / ")).toMatchObject({ ok: true });
      expect(log.posts).toEqual(["cert", "otp"]);
      expect(log.otpHosts).toEqual(["certificado-sso.tjsp.jus.br"]);
    }, { afterCert: redirect(`${CERT_SSO}/auth/otp`) });
  }, 20_000);

  it("apresenta o certificado somente em hosts .jus.br fixados no catálogo", () => {
    expect(eprocAllowedOrigins(getEprocPortalTarget("tjsp-2g")!)).toContain(CERT_SSO);
    expect(EPROC_PORTAL_TARGETS.every((target) => eprocAllowedOrigins(target).every((origin) => new URL(origin).hostname.endsWith(".jus.br")))).toBe(true);
  });

  it("todo destino do catálogo é https e .jus.br", () => {
    for (const target of EPROC_PORTAL_TARGETS) {
      for (const origin of eprocAllowedOrigins(target)) {
        const url = new URL(origin);
        expect(url.protocol).toBe("https:");
        expect(url.hostname.endsWith(".jus.br")).toBe(true);
      }
    }
  });

  it("lê somente rótulos, contagens e caminhos do painel, sem coletar valores dos processos", async () => {
    await fixture(async (page) => {
      await page.goto(`${EPROC}/painel`, { waitUntil: "domcontentloaded" });
      const observed = await observeEprocPanel(page, getEprocPortalTarget("tjmg-1g")!);
      expect(observed?.sections).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Processos com prazo em aberto", count: 4 }),
        expect.objectContaining({ label: "Processos pendentes de citação/intimação", count: 2 }),
        expect.objectContaining({ label: "Relação de Processos", count: null, path: "/eproc/controlador.php", queryKeys: ["acao", "num_processo_bi"] }),
      ]));
      expect(JSON.stringify(observed)).not.toContain("123456789");
    }, { handler: (url) => (url.pathname === "/eproc/painel" ? { body: eprocPanelHtml } : undefined) });
  });

  it("recusa origem que não seja oficial (nunca vem de URL informada por usuário)", () => {
    const tjmg = getEprocPortalTarget("tjmg-1g")!;
    expect(() => eprocAllowedOrigins({ ...tjmg, ssoOrigin: "https://sso.exemplo.com" })).toThrow(/oficial/i);
    expect(() => eprocAllowedOrigins({ ...tjmg, ssoOrigin: "http://sso.tjmg.jus.br" })).toThrow(/oficial/i);
    expect(() => eprocAllowedOrigins({ ...tjmg, ssoOrigin: "https://www.certisign.com.br" })).toThrow(/oficial/i);
    expect(() => eprocAllowedOrigins({ ...tjmg, authOrigins: ["https://autenticador.certisign.com.br"] })).toThrow(/oficial/i);
  });
});
