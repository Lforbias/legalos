"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  categories,
  sensitiveData,
  TERMS_TEXT,
  MARKETING_TEXT,
} from "@/lib/audience/policy";
export async function send(path: string, data: unknown) {
  const r = await fetch("/api/audience/" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Não foi possível concluir.");
  return j;
}
function Feedback({ text, error = false }: { text: string; error?: boolean }) {
  return text ? (
    <p
      role={error ? "alert" : "status"}
      className={"aud-feedback " + (error ? "error" : "")}
    >
      {text}
    </p>
  ) : null;
}
export function Action({
  path,
  data,
  children,
  primary = false,
}: {
  path: string;
  data?: unknown;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const [msg, setMsg] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div>
      <button
        disabled={busy}
        className={"aud-btn " + (primary ? "primary" : "")}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await send(path, data ?? {});
            setError(false);
            setMsg(r.message ?? "Pronto.");
            if (r.url) window.location.assign(r.url);
            else router.refresh();
          } catch (e) {
            setError(true);
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Aguarde…" : children}
      </button>
      <Feedback text={msg} error={error} />
    </div>
  );
}
export function AuthForm({
  origin,
  google,
  error,
}: {
  origin: string;
  google: boolean;
  error?: string;
}) {
  const [terms, setTerms] = useState(false),
    [marketing, setMarketing] = useState(false),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(
      error ? "Não foi possível entrar com Google. Tente novamente." : "",
    ),
    [failed, setFailed] = useState(Boolean(error));
  async function login(type: string, form?: HTMLFormElement) {
    setBusy(true);
    try {
      const f = form ? Object.fromEntries(new FormData(form)) : {};
      const r = await send("auth/" + type, { ...f, terms, marketing, origin });
      if (r.url) window.location.assign(r.url);
      setFailed(false);
      setMsg(r.message ?? "Redirecionando…");
    } catch (e) {
      setFailed(true);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="aud-card">
      <h2 style={{ marginTop: 0 }}>Criar conta ou entrar</h2>
      <p className="aud-muted">
        Use Google ou receba um link no seu e-mail. Você não precisa criar
        senha.
      </p>
      <label className="aud-check">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
        />
        <span>
          Li e aceito os{" "}
          <Link className="aud-link" href="/transparencia/termos">
            Termos de uso
          </Link>{" "}
          e a{" "}
          <Link className="aud-link" href="/transparencia/privacidade">
            Política de privacidade
          </Link>
          . (obrigatório)
        </span>
      </label>
      <label className="aud-check">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(e) => setMarketing(e.target.checked)}
        />
        <span>{MARKETING_TEXT} (opcional)</span>
      </label>
      <button
        className="aud-btn"
        style={{ width: "100%" }}
        disabled={!terms || busy || !google}
        onClick={() => login("google")}
      >
        Continuar com Google
      </button>
      {!google && (
        <p className="aud-muted">
          Google disponível após configuração. Você pode usar o e-mail abaixo.
        </p>
      )}
      <hr className="aud-rule" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void login("email", e.currentTarget);
        }}
      >
        <label>
          Seu nome
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            className="aud-input"
            autoComplete="name"
          />
        </label>
        <label>
          Seu e-mail
          <input
            name="email"
            type="email"
            required
            className="aud-input"
            autoComplete="email"
          />
        </label>
        <button
          className="aud-btn primary"
          disabled={!terms || busy}
          style={{ width: "100%" }}
        >
          Receber link de acesso
        </button>
      </form>
      <Feedback text={msg} error={failed} />
      <p className="aud-muted" style={{ marginTop: 20 }}>
        Sem o segundo aceite, você recebe apenas e-mails do serviço. A conta
        gratuita não dá acesso aos dados de escritórios.
      </p>
      <div className="aud-row">
        <Link className="aud-link" href="/login">
          Já sou cliente LegalOS
        </Link>
        <Link href="/produto/contato">Precisa de ajuda?</Link>
      </div>
    </div>
  );
}
export function Compose({
  kind,
  id,
  tool,
}: {
  kind: "question" | "reply" | "comment";
  id?: string;
  tool?: "prazos" | "rescisao";
}) {
  const [body, setBody] = useState(""),
    [title, setTitle] = useState(""),
    [tribunal, setTribunal] = useState(""),
    [source, setSource] = useState(""),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [error, setError] = useState(false);
  const found = sensitiveData(
      title + " " + body + " " + tribunal + " " + source,
    ),
    router = useRouter();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const f = Object.fromEntries(new FormData(e.currentTarget));
          const r = await send(kind, {
            ...f,
            id,
            ...(kind === "comment" ? (tool ? { tool } : { post: id }) : {}),
          });
          setMsg(r.message);
          setError(false);
          setBody("");
          setTitle("");
          router.refresh();
        } catch (e) {
          setError(true);
          setMsg((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {kind === "question" && (
        <>
          <label>
            Título da pergunta
            <input
              className="aud-input"
              name="title"
              minLength={12}
              maxLength={200}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="aud-columns">
            <label>
              Área
              <select className="aud-input" name="category">
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Tribunal (opcional)
              <input
                className="aud-input"
                name="tribunal"
                maxLength={60}
                value={tribunal}
                onChange={(e) => setTribunal(e.target.value)}
              />
            </label>
          </div>
        </>
      )}
      <label>
        {kind === "question"
          ? "Descreva sua dúvida, sem identificar pessoas"
          : kind === "reply"
            ? "Sua resposta"
            : "Seu comentário"}
        <textarea
          className="aud-input"
          name="body"
          rows={6}
          minLength={kind === "question" ? 20 : 10}
          maxLength={kind === "comment" ? 3000 : 6000}
          required
          value={body}
          aria-invalid={Boolean(found)}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Compartilhe o contexto sem nomes de clientes, documentos ou números de processo."
        />
      </label>
      {kind === "reply" && (
        <label>
          Fonte citada (opcional, um link)
          <input
            type="url"
            className="aud-input"
            name="source_url"
            maxLength={1000}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
      )}
      {found && (
        <Feedback
          error
          text={`Atenção: encontramos ${found}. Remova antes de publicar, para proteger o sigilo do cliente.`}
        />
      )}
      <div className="aud-row">
        <span className="aud-muted">
          Conteúdo passa pela moderação. Respostas não são parecer jurídico.
        </span>
        <button className="aud-btn primary" disabled={Boolean(found) || busy}>
          {busy ? "Enviando…" : "Enviar para moderação"}
        </button>
      </div>
      <Feedback text={msg} error={error} />
    </form>
  );
}
export function Report({ id }: { id: string }) {
  const [open, setOpen] = useState(false),
    [msg, setMsg] = useState("");
  return (
    <div>
      <button
        className="aud-muted"
        style={{ textDecoration: "underline", cursor: "pointer" }}
        onClick={() => setOpen(!open)}
      >
        Denunciar
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await send("report", {
                id,
                reason: new FormData(e.currentTarget).get("reason"),
              });
              setMsg(r.message);
              setOpen(false);
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          <label>
            Motivo
            <textarea
              className="aud-input"
              name="reason"
              required
              minLength={10}
              maxLength={1000}
            />
          </label>
          <button className="aud-btn">Enviar denúncia</button>
        </form>
      )}
      {msg && (
        <p role="status" className="aud-muted">
          {msg}
        </p>
      )}
    </div>
  );
}
export function Profile({
  name,
  area,
  state,
}: {
  name: string;
  area: string;
  state: string;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        try {
          await send("profile", f);
          window.location.reload();
        } catch (e) {
          window.alert((e as Error).message);
        }
      }}
    >
      <label>
        Nome
        <input
          className="aud-input"
          name="name"
          defaultValue={name}
          minLength={2}
          maxLength={100}
          required
        />
      </label>
      <label>
        Área
        <input
          className="aud-input"
          name="area"
          defaultValue={area}
          maxLength={80}
        />
      </label>
      <label>
        UF
        <select className="aud-input" name="state" defaultValue={state || "SP"}>
          {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
            .split(" ")
            .map((s) => (
              <option key={s}>{s}</option>
            ))}
        </select>
      </label>
      <button className="aud-btn">Salvar perfil</button>
    </form>
  );
}
// Keep exact consent wording exported alongside the UI for the auditable server record.
export const consentLabel = TERMS_TEXT;
