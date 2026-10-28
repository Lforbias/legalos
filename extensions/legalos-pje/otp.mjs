/* Runs only on an explicit popup gesture, in Chrome's isolated world. No storage or network API. */
export function pjeOtpStep(command = "inspect", code = "", ticket = "") {
  const u = new URL(location.href);
  const permitted = u.protocol === "https:" && u.hostname === "sso.cloud.pje.jus.br" && !u.port && !u.username && !u.password && /^\/(?:auth\/)?realms\/pje\/login-actions\/authenticate\/?$/.test(u.pathname);
  const fail = (state, message) => ({ ok: false, state, message });
  if (!permitted || window.top !== window) return fail("UNSUPPORTED", "Abra o desafio de código do login oficial PJe/Jus.br. Este assistente não envia códigos a outros sites ou formulários.");
  const visible = el => el instanceof HTMLElement && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const inputs = [...document.querySelectorAll('input[name="otp"], input[name="totp"]')].filter(el => el instanceof HTMLInputElement && visible(el) && !el.disabled && !el.readOnly && ["text", "password", "tel", "number"].includes(el.type));
  if (inputs.length !== 1) return fail("NO_CHALLENGE", "Nenhum desafio OTP compatível identificado. Conclua a primeira etapa do login no portal ou, se a tela mudou, preencha o código diretamente no tribunal.");
  const input = inputs[0]; const form = input.form;
  if (!(form instanceof HTMLFormElement) || !["kc-otp-login-form", "kc-totp-login-form"].includes(form.id) || form.method.toLowerCase() !== "post") return fail("UNSUPPORTED_FORM", "O formulário do segundo fator não é reconhecido. Nenhum código foi enviado.");
  let action;
  try { action = new URL(form.action, u); } catch { return fail("UNSUPPORTED_FORM", "Destino do formulário inválido."); }
  if (action.origin !== u.origin || !/^\/(?:auth\/)?realms\/pje\/login-actions\/authenticate\/?$/.test(action.pathname)) return fail("UNSUPPORTED_FORM", "O destino do formulário não corresponde ao login oficial. Nenhum código foi enviado.");
  const submit = form.querySelector('#kc-login[type="submit"]');
  if (!(submit instanceof HTMLElement) || !visible(submit) || submit.disabled || submit.form !== form || submit.hasAttribute("formaction") || submit.hasAttribute("formmethod") || submit.hasAttribute("formtarget")) return fail("UNSUPPORTED_FORM", "Não foi encontrado o botão de autenticação esperado. Nenhum código foi enviado.");
  if (form.target && form.target !== "_self") return fail("UNSUPPORTED_FORM", "O login deve continuar na mesma aba.");
  const invalid = [...document.querySelectorAll('#input-error-otp-code, #input-error, .kc-feedback-text')].some(el => visible(el) && /(?:c[oó]digo|code|token|otp).{0,60}(?:inv[aá]lid|incorret|incorrect|invalid|expir)|(?:invalid|incorrect).{0,30}(?:code|token|otp)/i.test(el.textContent || ""));
  if (command === "inspect") {
    const challenge = { ticket: crypto.randomUUID(), expires: Date.now() + 60000, input, form, submit, action: form.action };
    window.__legalosOtpChallenge = challenge;
    return { ok: true, state: invalid ? "INVALID_CODE" : "OTP_REQUIRED", ticket: challenge.ticket, expiresAt: challenge.expires, origin: u.origin, message: invalid ? "O tribunal recusou o código anterior. Informe um código novo do seu celular." : "O PJe está pedindo o segundo fator. Informe os 6 dígitos do seu celular; o código vai apenas para este login oficial." };
  }
  const saved = window.__legalosOtpChallenge;
  delete window.__legalosOtpChallenge;
  if (command !== "submit" || !saved || saved.ticket !== ticket || Date.now() > saved.expires || saved.input !== input || saved.form !== form || saved.submit !== submit || saved.action !== form.action) return fail("STALE", "A tela de login mudou ou a solicitação expirou. Verifique o login novamente antes de informar outro código.");
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return fail("INVALID_FORMAT", "Informe exatamente 6 dígitos do aplicativo autenticador.");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, code);
  input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
  if (form.action !== saved.action || input.form !== form || submit.form !== form || form.target && form.target !== "_self" || submit.hasAttribute("formaction") || submit.hasAttribute("formmethod") || submit.hasAttribute("formtarget")) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "");
    return fail("STALE", "O formulário mudou durante o preenchimento. Nenhum envio foi feito pelo assistente.");
  }
  // Authentication only: never submit any other form or click tribunal/process actions.
  HTMLFormElement.prototype.requestSubmit.call(form, submit);
  return { ok: true, state: "SUBMITTED", message: "Código enviado uma única vez ao PJe. Confira a resposta na aba do tribunal. Envio não significa login confirmado; se ele recusar ou expirar, use um código novo." };
}
