import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { pjeOtpStep } from "../../../extensions/legalos-pje/otp.mjs";

function fixture() {
  class Element {
    hidden = false; disabled = false; readOnly = false; form: Form | null = null;
    textContent = ""; attributes = new Set<string>();
    getClientRects() { return [{}]; }
    hasAttribute(name: string) { return this.attributes.has(name); }
  }
  class Input extends Element {
    type = "text"; private raw = "";
    get value() { return this.raw; } set value(v: string) { this.raw = v; }
    dispatchEvent = vi.fn();
  }
  const submitted = vi.fn();
  class Form extends Element {
    id = "kc-otp-login-form"; method = "post"; target = "";
    action = "https://sso.cloud.pje.jus.br/auth/realms/pje/login-actions/authenticate?session_code=synthetic";
    querySelector() { return submit; }
    requestSubmit(button: Element) { submitted(button); }
  }
  const form = new Form(); const input = new Input(); const submit = new Element(); input.form = form; submit.form = form;
  const errors: Element[] = []; let inputs = [input];
  const win: { top?: unknown } = {}; win.top = win;
  const network = vi.fn(() => { throw new Error("OTP must not use network APIs"); });
  const context = vm.createContext({ window: win, location: { href: form.action }, URL, HTMLElement: Element, HTMLInputElement: Input, HTMLFormElement: Form, getComputedStyle: () => ({ visibility: "visible" }), document: { querySelectorAll: (selector: string) => selector.startsWith("input[") ? inputs : errors }, crypto: webcrypto, Date, Event, fetch: network });
  const step = (command = "inspect", code = "", ticket = "") => vm.runInContext(`(${pjeOtpStep.toString()})(${JSON.stringify(command)},${JSON.stringify(code)},${JSON.stringify(ticket)})`, context) as ReturnType<typeof pjeOtpStep>;
  return { context, form, input, submit, submitted, network, errors, Element, win, step, setInputs: (next: Input[]) => { inputs = next; } };
}

describe("segundo fator assistido do PJe: interação restrita ao desafio oficial", () => {
  it("pede código apenas na tela OTP e envia uma vez para o mesmo formulário/documento", () => {
    const f = fixture(); const challenge = f.step();
    expect(challenge).toMatchObject({ ok: true, state: "OTP_REQUIRED" });
    expect(f.input.value).toBe(""); expect(f.submitted).not.toHaveBeenCalled();
    expect(f.step("submit", "012345", challenge.ticket)).toMatchObject({ ok: true, state: "SUBMITTED" });
    expect(f.input.value).toBe("012345"); expect(f.submitted).toHaveBeenCalledExactlyOnceWith(f.submit);
    expect(f.step("submit", "012345", challenge.ticket).state).toBe("STALE");
    expect(f.submitted).toHaveBeenCalledOnce(); expect(f.network).not.toHaveBeenCalled();
  });
  it("não confunde primeira etapa, domínio parecido ou outro realm com o desafio", () => {
    for (const url of ["http://sso.cloud.pje.jus.br/auth/realms/pje/login-actions/authenticate", "https://sso.cloud.pje.jus.br.evil.test/auth/realms/pje/login-actions/authenticate", "https://sso.cloud.pje.jus.br/auth/realms/outro/login-actions/authenticate", "https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth", "https://pje1g.trf1.jus.br/pje/"]) {
      const f = fixture(); f.context.location.href = url; expect(f.step().state).toBe("UNSUPPORTED"); expect(f.submitted).not.toHaveBeenCalled();
    }
    const f = fixture(); f.setInputs([]); expect(f.step().state).toBe("NO_CHALLENGE");
    f.setInputs([f.input, f.input]); expect(f.step().state).toBe("NO_CHALLENGE");
    f.win.top = {}; expect(f.step().state).toBe("UNSUPPORTED");
  });
  it("recusa destino adulterado, botão que redireciona e envio sem desafio válido", () => {
    const f = fixture(); expect(f.step("submit", "123456", "inventado").state).toBe("STALE");
    f.form.action = "https://evil.test/collect"; expect(f.step().state).toBe("UNSUPPORTED_FORM");
    const g = fixture(); g.submit.attributes.add("formaction"); expect(g.step().state).toBe("UNSUPPORTED_FORM");
    const h = fixture(); const challenge = h.step(); h.form.action += "-changed";
    expect(h.step("submit", "123456", challenge.ticket).state).toBe("STALE"); expect(h.submitted).not.toHaveBeenCalled();
  });
  it("não envia código inválido nem aceita um formulário alterado por evento", () => {
    const f = fixture(); expect(f.step("submit", "abcdef", f.step().ticket).state).toBe("INVALID_FORMAT");
    expect(f.submitted).not.toHaveBeenCalled();
    const g = fixture(); const challenge = g.step(); g.input.dispatchEvent.mockImplementation(() => { g.form.action = "https://evil.test/collect"; });
    expect(g.step("submit", "123456", challenge.ticket).state).toBe("STALE"); expect(g.submitted).not.toHaveBeenCalled(); expect(g.input.value).toBe("");
  });
  it("expira o pedido sem enviar nem preencher o código", () => {
    const f = fixture(); const challenge = f.step(); f.context.Date = { now: () => challenge.expiresAt! + 1 };
    expect(f.step("submit", "123456", challenge.ticket).state).toBe("STALE"); expect(f.submitted).not.toHaveBeenCalled(); expect(f.input.value).toBe("");
  });
  it("distingue código recusado de login aceito e não retorna o texto bruto do portal", () => {
    const f = fixture(); const error = new f.Element(); error.textContent = "Código inválido. conteúdo privado do portal"; f.errors.push(error);
    const result = f.step(); expect(result.state).toBe("INVALID_CODE"); expect(result.message).not.toContain("conteúdo privado");
  });
});
