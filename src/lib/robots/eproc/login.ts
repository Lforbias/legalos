import type { Frame, Page } from "playwright-core";
import { totpCode, totpStep, TOTP_PERIOD } from "@/lib/security/totp";
import { describeSignature, hostAndPath, pageSerializable, sanitizeSignature, type FrameSignature, type PageSignature } from "../pje/signature";
import type { LoginOutcome, LoginProgress, PjeCredentials } from "../pje/login";
import { eprocAllowedOrigins, type EprocPortalTarget } from "./targets";

export const TJMG_EPROC_LOGIN_URL = "https://eproc1g.tjmg.jus.br/eproc/";
const BLOCKED = /bloquead|excedeu|muitas tentativas|temporariamente|suspens/i;

export type EprocStateKind = "LOGIN" | "OTP" | "OTP_SETUP" | "CAPTCHA" | "CERT_ERROR" | "WAIT" | "APP" | "UNKNOWN";
export type EprocState = {
  kind: EprocStateKind;
  host: string;
  errorText: string;
  /** Aviso do próprio eproc que não muda a etapa: o acesso ao certificado está mais lento que o normal. */
  notice?: "SLOW_CERTIFICATE";
  otpSelector?: string;
  otpButton?: string;
  userSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
};

/**
 * Roda DENTRO de uma página ou quadro e classifica só a tela e os seletores do desafio; não coleta valores dos campos.
 * Sem referências externas (é serializada para o navegador). `allowedHosts` vem do catálogo oficial do tribunal.
 */
export function detectEprocState({ targetHost, ssoHost, allowedHosts }: { targetHost: string; ssoHost?: string; allowedHosts?: string[] }): EprocState {
  const OTP = /token|c[oó]digo|codigo|otp|totp|2fa|autentica[cç][aã]o/i;
  const OTP_STRICT = /token|c[oó]digo|codigo|otp|totp|2fa/i;
  function visible(el: Element) {
    const h = el as HTMLElement;
    const style = getComputedStyle(h);
    return style.display !== "none" && style.visibility !== "hidden" && (h.offsetWidth > 0 || h.offsetHeight > 0 || h.getClientRects().length > 0);
  }
  function one(selector: string) { return Array.from(document.querySelectorAll(selector)).find(visible) ?? null; }
  function text(el: Element | null) { return (el?.textContent ?? "").replace(/\s+/g, " ").trim(); }
  const errorText = Array.from(document.querySelectorAll(".alert-danger, .alert-error, .invalid-feedback, [role='alert'], .text-danger"))
    .filter(visible).map(text).filter(Boolean).join(" | ").slice(0, 300);
  const host = location.host;
  // about:blank / about:srcdoc ainda não carregaram nada: é só espera.
  if (!host) return { kind: "WAIT", host, errorText };
  const allowed = [targetHost, ssoHost, ...(allowedHosts ?? [])];
  if (!allowed.includes(host)) return { kind: "UNKNOWN", host, errorText };

  // Páginas de ajuda do próprio eproc para o certificado (abertas em quadro/modal por `exibirSubFrm`). Só a URL e o título são
  // testados aqui; nada disso é devolvido.
  const query = location.search;
  const title = document.title;
  if (/acao=erro_certificado_digital(&|$)/i.test(query) || /n.o foi poss.vel validar o seu certificado/i.test(title)) return { kind: "CERT_ERROR", host, errorText };
  if (/acao=erro_carregar_certificado_digital(&|$)/i.test(query) || /acesso ao seu certificado digital est. demorando/i.test(title)) return { kind: "WAIT", host, errorText, notice: "SLOW_CERTIFICATE" };
  if (document.readyState === "loading" || !document.body) return { kind: "WAIT", host, errorText };

  if (one("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, .h-captcha, [data-sitekey]")) return { kind: "CAPTCHA", host, errorText };
  const user = one("#txtUsuario[name='txtUsuario']");
  // TJMG eproc displays a name-less text field and keeps a hidden password input
  // with the submitted name; its official Submit('login') handler copies between them.
  const password = one("#pwdSenha");
  if (user && password) return { kind: "LOGIN", host, errorText, userSelector: "#txtUsuario", passwordSelector: "#pwdSenha", submitSelector: "#sbmEntrar" };
  if (one("#username") && one("#password")) return { kind: "LOGIN", host, errorText, userSelector: "#username", passwordSelector: "#password", submitSelector: "#kc-login" };

  const otpInput = Array.from(document.querySelectorAll("input:not([type='hidden'])"))
    .find((el) => {
      const input = el as HTMLInputElement;
      if (["button", "submit", "reset", "checkbox", "radio", "file", "image"].includes(input.type) || !visible(el)) return false;
      const label = input.id ? Array.from(document.querySelectorAll("label")).find((candidate) => candidate.htmlFor === input.id) : undefined;
      const hints = `${input.name} ${input.id} ${input.placeholder} ${text(label ?? null)}`;
      if (input.autocomplete === "one-time-code") return true;
      // Campo mascarado (type=password) só vale se for claramente de código; nunca um campo de senha.
      if (input.type === "password") return OTP_STRICT.test(hints) && !/senha|password/i.test(hints);
      return OTP.test(hints);
    });
  if (otpInput) {
    const button = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']"))
      .find((el) => visible(el) && /validar|confirmar|entrar|continuar|enviar|verificar/i.test((el as HTMLInputElement).value || text(el)));
    const otpEl = otpInput as HTMLInputElement;
    const otpSelector = otpEl.id && /^[\w-]+$/.test(otpEl.id)
      ? `#${otpEl.id}`
      : otpEl.name && /^[\w-]+$/.test(otpEl.name)
        ? `input[name='${otpEl.name}']`
        : otpEl.autocomplete === "one-time-code"
          ? "input[autocomplete='one-time-code']"
          : undefined;
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

  // Área autenticada só com evidência de sessão: o controlador interno (`controlador.php`; as páginas públicas usam
  // `externo_controlador.php`) ou um link de saída. "Qualquer página sem formulário de login" não prova que o tribunal aceitou
  // o acesso (pode ser tela de erro, de espera ou área pública).
  const internalArea = /\/controlador\.php$/i.test(location.pathname);
  const logoutLink = Boolean(document.querySelector("a[href*='acao=logout' i], a[href*='logout' i]"));
  if (window.top === window && !one("#frmLogin") && !one("#pwdSenha") && document.body.innerText.trim().length > 0 && (internalArea || logoutLink)) return { kind: "APP", host, errorText };
  return { kind: "UNKNOWN", host, errorText };
}

/** Roda DENTRO de uma página ou quadro: só estrutura (nomes de campos, textos de botões), nunca valores. */
export function collectEprocSignature(): PageSignature {
  return {
    host: location.host,
    path: location.pathname,
    title: document.title,
    headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((el) => (el.textContent ?? "").trim()).filter(Boolean).slice(0, 8),
    fields: Array.from(document.querySelectorAll("input,select,textarea")).map((el) => {
      const i = el as HTMLInputElement;
      return `${el.tagName.toLowerCase()}:${i.type || ""}:${i.name || i.id || ""}`;
    }).slice(0, 20),
    buttons: Array.from(document.querySelectorAll("button,input[type='submit'],input[type='button']")).map((el) => ((el as HTMLInputElement).value || el.textContent || "").trim()).filter(Boolean).slice(0, 12),
  };
}

const sleepDefault = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type EprocLoginOptions = {
  names?: string[];
  usedOtpSteps?: Set<number>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  stepTimeoutMs?: number;
  /** Quanto tempo uma tela não reconhecida precisa ficar igual antes de o robô desistir (padrão 6 s). */
  settleMs?: number;
  onProgress?: LoginProgress;
};

type Located = { state: EprocState; frame: Frame };
type Scan = { best: Located | null; foreignHosts: string[]; foreignPages: number; notices: Set<string>; mainLoading: boolean };
type Outcome = { located: Located | null; scan: Scan; unknown: boolean };

/** Quando abas/quadros mostram telas diferentes, vale a que pede ação ou prova o resultado. */
const RANK: Record<EprocStateKind, number> = { CAPTCHA: 8, CERT_ERROR: 7, OTP: 6, OTP_SETUP: 5, APP: 4, LOGIN: 3, UNKNOWN: 2, WAIT: 1 };
const STAGE: Record<EprocStateKind, string> = {
  LOGIN: "formulário de acesso",
  OTP: "pedido do código de dois fatores",
  OTP_SETUP: "ativação do segundo fator pendente",
  CAPTCHA: "verificação humana",
  CERT_ERROR: "aviso de erro na validação do certificado",
  APP: "área autenticada do eproc",
  WAIT: "carregando",
  UNKNOWN: "tela não reconhecida",
};
/** Páginas de ajuda do eproc para o certificado (`exibirSubFrm`), reconhecidas só pela URL. */
function knownCertificatePage(url: string): Pick<EprocState, "kind" | "errorText" | "notice"> | null {
  try {
    const acao = new URL(url).searchParams.get("acao");
    if (acao === "erro_certificado_digital") return { kind: "CERT_ERROR", errorText: "" };
    if (acao === "erro_carregar_certificado_digital") return { kind: "WAIT", errorText: "", notice: "SLOW_CERTIFICATE" };
  } catch { /* URL inválida: segue para a leitura normal */ }
  return null;
}
const safeHost = (host: string) => host.toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 80);
const withTimeout = <T,>(promise: Promise<T>, ms: number) => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

export async function loginEprocPortal(page: Page, target: EprocPortalTarget, creds: PjeCredentials, opts: EprocLoginOptions = {}): Promise<LoginOutcome> {
  const sleep = opts.sleep ?? sleepDefault;
  const now = opts.now ?? Date.now;
  const timeout = opts.stepTimeoutMs ?? 30_000;
  const settleMs = opts.settleMs ?? 6_000;
  // Só estas origens (eproc e, quando existir, o SSO oficial) são lidas ou recebem dados. Qualquer outra é tratada como tela
  // desconhecida e o robô para sem enviar nada.
  const allowedHosts = eprocAllowedOrigins(target).map((origin) => new URL(origin).host);
  const targetHost = new URL(target.loginUrl).host;
  const detectArgs = { targetHost, allowedHosts };

  const emptyFrame = (info: { host: string; path: string }) => ({ host: info.host, path: info.path, title: "", headings: [] as string[], fields: [] as string[], buttons: [] as string[] });
  const readFrameSignature = async (frame: Frame) => {
    const info = hostAndPath(frame.url());
    // Telas de outros endereços não são lidas: só host e caminho (sem query).
    if (info.host && !allowedHosts.includes(info.host)) return emptyFrame(info);
    try {
      return await withTimeout(frame.evaluate(pageSerializable(collectEprocSignature)), 2_500);
    } catch {
      return emptyFrame(info);
    }
  };
  const signature = async (focus: Page = page): Promise<PageSignature | null> => {
    try {
      const subject = focus.isClosed() ? page : focus;
      const main = subject.mainFrame();
      const top = await readFrameSignature(main);
      const frames: FrameSignature[] = [];
      for (const child of subject.frames()) {
        if (child === main) continue;
        const f = await readFrameSignature(child);
        frames.push({ host: f.host, path: f.path, title: f.title, fields: f.fields, buttons: f.buttons });
        if (frames.length >= 6) break;
      }
      return sanitizeSignature({ ...top, ...(frames.length ? { frames } : {}), pages: subject.context().pages().length }, opts.names ?? []);
    } catch { return null; }
  };
  const fail = async (code: Extract<LoginOutcome, { ok: false }>["code"], message: string, retryable: boolean, diagnose = false, focus: Page = page): Promise<LoginOutcome> => {
    await opts.onProgress?.(message, code === "NEEDS_PERSON" || code === "OTP_NOT_CONFIGURED" || code === "OTP_MISSING" ? "WARN" : "ERROR");
    const sig = await signature(focus);
    // Diagnóstico no terminal: estrutura sanitizada (a mesma que vai para robot_jobs.summary.signature), nunca valores.
    if (diagnose) for (const line of describeSignature(sig)) await opts.onProgress?.(line);
    return { ok: false, code, message, retryable, signature: sig };
  };
  const failUnknown = (outcome: Outcome | null, phase: "initial" | "certificate" | "login" | "otp") => {
    const foreignHost = outcome?.scan.foreignHosts[0];
    const message = foreignHost
      ? `O eproc levou para o endereço ${foreignHost}, que não está na lista oficial do LegalOS. O robô parou e nada foi enviado a esse endereço.`
      : phase === "certificate"
        ? "Depois do certificado digital, o eproc mostrou uma tela que o LegalOS não reconhece. O robô parou sem enviar nada; o diagnóstico da tela está no terminal."
        : phase === "login"
          ? "Depois do envio do usuário e da senha, o eproc mostrou uma tela que o LegalOS não reconhece. O robô parou; o diagnóstico da tela está no terminal."
          : phase === "otp"
            ? "O eproc mostrou uma etapa inesperada depois do código de dois fatores; o LegalOS não considera o acesso validado. O diagnóstico da tela está no terminal."
            : "A tela de acesso do eproc mudou; o LegalOS parou sem enviar os dados.";
    return fail("UNKNOWN_PAGE", message, false, true, outcome?.located?.frame.page() ?? page);
  };

  /**
   * Lê todas as abas e quadros do navegador isolado; só olha dentro dos endereços permitidos. A leitura é em paralelo e com prazo
   * curto: enquanto o formulário está sendo enviado, o Chromium segura o `evaluate` da página principal até a navegação
   * começar, e isso não pode impedir a leitura dos quadros (ex.: o aviso de lentidão do certificado).
   */
  const scan = async (): Promise<Scan> => {
    const result: Scan = { best: null, foreignHosts: [], foreignPages: 0, notices: new Set(), mainLoading: false };
    const foreign = new Set<string>();
    let pages: Page[];
    try { pages = page.context().pages().filter((candidate) => !candidate.isClosed()); } catch { pages = [page]; }
    const reads: Promise<{ frame: Frame; isMain: boolean; state: EprocState | null }>[] = [];
    for (const candidate of pages) {
      for (const frame of candidate.frames()) {
        const host = hostAndPath(frame.url()).host;
        const isMain = frame === candidate.mainFrame();
        if (host && !allowedHosts.includes(host)) {
          foreign.add(safeHost(host));
          if (isMain) result.foreignPages += 1;
          continue;
        }
        // As páginas de ajuda do certificado do eproc são identificadas pela própria URL (só o valor de `acao` é lido, nada é
        // registrado): com um envio de formulário em andamento o Chromium não responde ao `evaluate` do quadro.
        const known = knownCertificatePage(frame.url());
        if (known) {
          reads.push(Promise.resolve({ frame, isMain, state: { ...known, host } }));
          continue;
        }
        reads.push(withTimeout(frame.evaluate(pageSerializable(detectEprocState), detectArgs), 800).then((state) => ({ frame, isMain, state }), () => ({ frame, isMain, state: null })));
      }
    }
    for (const read of await Promise.all(reads)) {
      if (!read.state) continue;
      if (read.state.notice) result.notices.add(read.state.notice);
      if (read.isMain && read.state.kind === "WAIT" && !read.state.notice) result.mainLoading = true;
      if (!result.best || RANK[read.state.kind] > RANK[result.best.state.kind]) result.best = { state: read.state, frame: read.frame };
    }
    result.foreignHosts = [...foreign];
    return result;
  };

  let slowNoticeSent = false;
  /**
   * Espera uma etapa reconhecida. Dois tipos de tela só valem depois de ficarem iguais por um tempo, porque aparecem em
   * transições (página de espera, quadro/modal que ainda carrega, redirecionamento em andamento):
   *  - tela não reconhecida: com `giveUpOnUnknown`, encerra a espera como "unknown" depois de `settleMs`;
   *  - estados `tentative` (ex.: área autenticada logo depois do certificado, aviso de 2º fator pendente): só valem se nenhum
   *    desafio (código de dois fatores, captcha, erro) aparecer em seguida, em outra aba ou quadro.
   */
  const waitOutcome = async (cfg: { done: (state: EprocState) => boolean; giveUpOnUnknown: boolean; tentative?: EprocStateKind[] }): Promise<Outcome | null> => {
    const end = Date.now() + timeout;
    let candidateKey = "";
    let candidateSince = 0;
    while (Date.now() < end) {
      const current = await scan();
      if (current.notices.has("SLOW_CERTIFICATE") && !slowNoticeSent) {
        slowNoticeSent = true;
        await opts.onProgress?.("O eproc avisou que o acesso ao certificado está demorando mais que o normal; o LegalOS continua aguardando.", "WARN");
      }
      const best = current.best;
      const recognized = best && best.state.kind !== "UNKNOWN" && best.state.kind !== "WAIT" && cfg.done(best.state);
      const tentative = Boolean(recognized && cfg.tentative?.includes(best!.state.kind));
      if (recognized && !tentative) return { located: best, scan: current, unknown: false };
      const unknownCandidate = cfg.giveUpOnUnknown && (current.foreignPages > 0 || best?.state.kind === "UNKNOWN");
      if ((tentative || unknownCandidate) && !current.mainLoading) {
        const where = best ? hostAndPath(best.frame.url()) : { host: "", path: "" };
        const key = `${tentative ? "T" : "U"}|${current.foreignHosts.join(",")}|${best?.state.kind ?? ""}|${where.host}${where.path}`;
        if (key !== candidateKey) {
          candidateKey = key;
          candidateSince = Date.now();
        } else if (Date.now() - candidateSince >= (best?.state.kind === "APP" ? Math.min(settleMs, 2_500) : settleMs)) {
          return tentative ? { located: best, scan: current, unknown: false } : { located: best, scan: current, unknown: true };
        }
      } else {
        candidateKey = "";
      }
      await sleep(350);
    }
    return null;
  };
  const announce = async (located: Located) => {
    const where = located.frame !== located.frame.page().mainFrame() ? " (em quadro interno)" : located.frame.page() !== page ? " (em nova aba)" : "";
    await opts.onProgress?.(`Tela identificada: ${STAGE[located.state.kind]}${where}.`);
  };

  try {
    await opts.onProgress?.(`Abrindo o portal oficial do ${target.courtCode}, ${target.degree}º grau (eproc).`);
    await page.goto(target.loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch {
    return fail("NETWORK", `Não foi possível abrir o eproc do ${target.courtCode} agora.`, true);
  }
  await opts.onProgress?.("Portal respondeu; identificando a etapa de autenticação.");
  let outcome = await waitOutcome({ done: () => true, giveUpOnUnknown: false });
  if (!outcome) return fail("TIMEOUT", `A tela de acesso do eproc do ${target.courtCode} não carregou a tempo.`, true, true);
  let located = outcome.located!;
  let s = located.state;
  await announce(located);
  if (s.kind === "CAPTCHA") return fail("NEEDS_PERSON", "O eproc pediu uma verificação de segurança. O LegalOS parou para você concluir no portal oficial.", false);

  if (creds.certificateAuth && s.kind === "LOGIN") {
    // O eproc TJMG implementa esta ação como <input type="button" value="Certificado Digital" onclick="SubmitCert()">.
    // `SubmitCert()` envia o formulário, na mesma aba, para o `destino_v2_cert` (mesmo host do eproc, `acao=login_cert`).
    // getByText não encontra o value do input, e a página ainda contém links de ajuda com o mesmo texto.
    let certificateButton = page.getByRole("button", { name: /certificado\s+digital/i }).first();
    if (!(await certificateButton.count())) certificateButton = page.locator("input[type='button'][value*='Certificado' i], button:has-text('Certificado Digital'), a:has-text('Certificado Digital')").first();
    if (!(await certificateButton.count())) return fail("CERTIFICATE_REQUIRED", "O eproc não ofereceu autenticação por certificado no fluxo do navegador remoto.", false, true);
    await opts.onProgress?.("Selecionando a opção de entrada por certificado digital.");
    // noWaitAfter: o clique não espera a navegação terminar; quem acompanha a resposta (e o aviso de lentidão do eproc) é a varredura abaixo.
    await certificateButton.click({ noWaitAfter: true });
    await opts.onProgress?.("Botão do certificado acionado. O LegalOS só considera o acesso válido quando o eproc mostrar a área autenticada ou pedir o código de dois fatores.");
    outcome = await waitOutcome({ done: (state) => state.kind !== "LOGIN" || Boolean(state.errorText), giveUpOnUnknown: true, tentative: ["APP", "OTP_SETUP"] });
    if (!outcome) return fail("TIMEOUT", "O eproc demorou para iniciar o login por certificado.", true, true);
    if (outcome.unknown) return failUnknown(outcome, "certificate");
    located = outcome.located!;
    s = located.state;
    await announce(located);
  } else if (!creds.certificateAuth) {
    if (s.kind !== "LOGIN") return failUnknown(outcome, "initial");
    await opts.onProgress?.("Enviando a autenticação configurada; valores de acesso ficam ocultos.");
    await page.fill(s.userSelector!, creds.document);
    await page.fill(s.passwordSelector!, creds.password);
    await page.click(s.submitSelector!, { noWaitAfter: true });
    outcome = await waitOutcome({ done: (state) => state.kind !== "LOGIN" || Boolean(state.errorText), giveUpOnUnknown: true, tentative: ["OTP_SETUP"] });
    if (!outcome) return fail("TIMEOUT", `O eproc do ${target.courtCode} demorou demais para responder ao login.`, true, true);
    if (outcome.unknown) return failUnknown(outcome, "login");
    located = outcome.located!;
    s = located.state;
    await announce(located);
  }

  if (s.kind === "LOGIN") {
    if (creds.certificateAuth) return fail("CERTIFICATE_REJECTED", "O eproc recusou o certificado digital.", false, true);
    if (BLOCKED.test(s.errorText)) return fail("ACCOUNT_BLOCKED", "O eproc informou bloqueio ou excesso de tentativas. O LegalOS parou para não agravar.", false);
    return fail("BAD_CREDENTIALS", "O eproc recusou o usuário ou a senha. Confira os dados no portal oficial; o LegalOS não repetirá senha errada automaticamente.", false);
  }
  if (s.kind === "CAPTCHA") return fail("NEEDS_PERSON", "O eproc pediu uma verificação de segurança. O LegalOS parou para você concluir no portal oficial.", false);
  if (s.kind === "CERT_ERROR") return fail("CERTIFICATE_REJECTED", "O eproc informou que não foi possível validar o certificado digital. Confira se é o certificado cadastrado no eproc e se está dentro da validade.", false, true, located.frame.page());
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
    // O desafio pode estar em quadro/modal ou em outra aba: o código vai para o mesmo quadro em que o campo foi encontrado.
    await located.frame.fill(s.otpSelector!, totpCode(creds.otpSecret, step));
    if (s.otpButton) await located.frame.click(s.otpButton, { noWaitAfter: true });
    else await located.frame.press(s.otpSelector!, "Enter", { noWaitAfter: true });
    await opts.onProgress?.("Código enviado; aguardando validação do portal.");
    // Depois do código só vale um resultado: área autenticada, código recusado, captcha ou erro. Um formulário de acesso sem erro
    // pode ser só a aba/quadro anterior ainda aberta.
    outcome = await waitOutcome({ done: (state) => (state.kind !== "OTP" && state.kind !== "LOGIN") || Boolean(state.errorText), giveUpOnUnknown: true, tentative: ["OTP_SETUP"] });
    if (!outcome) return fail("TIMEOUT", "O eproc demorou demais para validar o código de dois fatores.", true, true);
    if (outcome.unknown) return failUnknown(outcome, "otp");
    located = outcome.located!;
    s = located.state;
    if (s.kind === "OTP") return fail("OTP_REJECTED", "O eproc recusou o código de dois fatores. Confira a chave cadastrada e o relógio do servidor.", false);
    if (s.kind === "CAPTCHA") return fail("NEEDS_PERSON", "O eproc pediu uma verificação de segurança. O LegalOS parou para você concluir no portal oficial.", false);
  } else if (s.kind === "APP" && creds.certificateAuth) {
    await opts.onProgress?.("O eproc não pediu o código de dois fatores neste acesso.");
  }
  const finalPage = located.frame.page();
  if (s.kind !== "APP" || hostAndPath(finalPage.url()).host !== targetHost) return failUnknown({ located, scan: { best: located, foreignHosts: [], foreignPages: 0, notices: new Set(), mainLoading: false }, unknown: true }, "otp");
  const final = await signature(finalPage);
  await opts.onProgress?.("Login confirmado pelo portal; área autenticada detectada.", "SUCCESS");
  return { ok: true, signature: final ?? { host: s.host, path: "", title: "", headings: [], fields: [], buttons: [] } };
}

export async function loginEprocTjmg(page: Page, creds: PjeCredentials, opts: EprocLoginOptions = {}): Promise<LoginOutcome> {
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
