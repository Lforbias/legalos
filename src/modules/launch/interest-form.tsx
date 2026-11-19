"use client";

import * as React from "react";
import { INTEREST_CONSENT_TEXT } from "@/lib/launch";
import { registerInterestAction, type InterestState } from "./actions";

type Styles = Record<"form" | "row" | "field" | "input" | "error" | "consent" | "trap" | "btn" | "btnRed" | "done" | "mono", string | undefined>;

const initial: InterestState = { status: "idle" };

export function InterestForm({ s }: { s: Styles }) {
  const [state, action, pending] = React.useActionState(registerInterestAction, initial);
  const doneRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { if (state.status === "ok") doneRef.current?.focus(); }, [state.status]);

  if (state.status === "ok") {
    return (
      <div ref={doneRef} tabIndex={-1} className={s.done} role="status" data-testid="interest-done">
        <h3>Interesse registrado.</h3>
        <p>Obrigado! O nosso comercial vai falar com você antes do lançamento.</p>
      </div>
    );
  }

  const err = (k: string) => state.fields?.[k];
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className={s.field}>
      <label className={s.field}>
        <span className={s.mono}>{label}</span>
        <input name={name} className={s.input} aria-invalid={err(name) ? true : undefined} aria-describedby={err(name) ? `${name}-erro` : undefined} {...props} />
      </label>
      {err(name) ? <small id={`${name}-erro`} className={s.error}>{err(name)}</small> : null}
    </div>
  );

  return (
    <form action={action} className={s.form} noValidate aria-describedby={state.message ? "interest-msg" : undefined}>
      <div className={s.row}>
        {field("name", "Nome", { required: true, autoComplete: "name", maxLength: 120 })}
        {field("office", "Escritório", { autoComplete: "organization", maxLength: 160 })}
      </div>
      <div className={s.row}>
        {field("email", "E-mail", { type: "email", required: true, autoComplete: "email", maxLength: 200 })}
        {field("whatsapp", "WhatsApp (com DDD)", { type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: 30 })}
      </div>
      <div className={s.trap} aria-hidden="true">
        <label>Site<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className={s.consent}>
        <input type="checkbox" name="consent" required aria-invalid={err("consent") ? true : undefined} />
        <span>{INTEREST_CONSENT_TEXT}</span>
      </label>
      {err("consent") ? <small className={s.error}>{err("consent")}</small> : null}
      {state.message ? <p id="interest-msg" className={s.error} role="alert">{state.message}</p> : null}
      <button type="submit" className={`${s.btn} ${s.btnRed}`} disabled={pending}>{pending ? "Enviando…" : "Registrar interesse →"}</button>
    </form>
  );
}
