"use client";

import { Link2, Paperclip, Send, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_MESSAGE, MESSAGE_MAX_LENGTH, RESOURCE_KIND_LABEL, RESOURCE_KINDS, type ResourceKind } from "./constants";
import { fetchJson, formatBytes, Modal } from "./ui";

export type ComposerSubmit = { body: string; files: File[]; resources: { kind: string; resourceId: string; title: string }[]; mentionedIds: string[] };

type Member = { userId: string; name: string };

export function Composer({
  placeholder,
  members,
  canShare,
  disabled,
  disabledReason,
  onSend,
  autoFocus,
  testId = "cowork-composer",
}: {
  placeholder: string;
  members: Member[];
  canShare: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (s: ComposerSubmit) => void;
  autoFocus?: boolean;
  testId?: string;
}) {
  const [text, setText] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [resources, setResources] = React.useState<ComposerSubmit["resources"]>([]);
  const [mentions, setMentions] = React.useState<Member[]>([]);
  const [query, setQuery] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [sharing, setSharing] = React.useState(false);
  const ta = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const suggestions = query === null ? [] : members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const updateQuery = (value: string, caret: number) => {
    const upto = value.slice(0, caret);
    const m = /(^|\s)@([\p{L}\p{N} ._-]{0,30})$/u.exec(upto);
    setQuery(m ? (m[2] ?? "") : null);
    setActive(0);
  };

  const pick = (m: Member) => {
    const el = ta.current;
    const caret = el?.selectionStart ?? text.length;
    const upto = text.slice(0, caret);
    const start = upto.lastIndexOf("@");
    const next = `${text.slice(0, start)}@${m.name} ${text.slice(caret)}`;
    setText(next);
    setMentions((prev) => (prev.some((p) => p.userId === m.userId) ? prev : [...prev, m]));
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = start + m.name.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    if (disabled) return;
    const body = text.trim();
    if (!body && !files.length && !resources.length) return;
    if (body.length > MESSAGE_MAX_LENGTH) {
      setError(`Mensagem muito longa (máx. ${MESSAGE_MAX_LENGTH} caracteres).`);
      return;
    }
    const mentionedIds = mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.userId);
    onSend({ body, files, resources, mentionedIds });
    setText("");
    setFiles([]);
    setResources([]);
    setMentions([]);
    setError(null);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = [...list];
    const big = incoming.find((f) => f.size > ATTACHMENT_MAX_BYTES);
    if (big) {
      setError(`${big.name} passa de 8 MB.`);
      return;
    }
    const all = [...files, ...incoming].slice(0, ATTACHMENTS_PER_MESSAGE);
    if (files.length + incoming.length > ATTACHMENTS_PER_MESSAGE) setError(`Até ${ATTACHMENTS_PER_MESSAGE} arquivos por mensagem.`);
    else setError(null);
    setFiles(all);
  };

  if (disabled) {
    return <div className="border-t border-border px-4 py-3 text-center text-xs text-muted sm:px-6">{disabledReason ?? "Somente leitura."}</div>;
  }

  return (
    <div className="border-t border-border bg-surface px-3 py-3 sm:px-5" data-testid={testId}>
      {files.length || resources.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={`f${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs">
              <Paperclip className="h-3 w-3" aria-hidden /> {f.name} <span className="text-muted">{formatBytes(f.size)}</span>
              <button type="button" aria-label={`Remover ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" aria-hidden /></button>
            </span>
          ))}
          {resources.map((r, i) => (
            <span key={`r${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-surface-2 px-2.5 py-1 text-xs" data-testid="cowork-share-chip">
              <Link2 className="h-3 w-3" aria-hidden /> {RESOURCE_KIND_LABEL[r.kind as ResourceKind]}: {r.title}
              <button type="button" aria-label={`Remover ${r.title}`} onClick={() => setResources(resources.filter((_, j) => j !== i))}><X className="h-3 w-3" aria-hidden /></button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative rounded-xl border border-border bg-bg/45 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        {suggestions.length ? (
          <ul className="absolute bottom-full left-2 z-20 mb-2 w-64 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg" role="listbox" aria-label="Mencionar">
            {suggestions.map((m, i) => (
              <li key={m.userId} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }} className={cn("w-full px-3 py-1.5 text-left text-sm", i === active ? "bg-surface-2" : "hover:bg-surface-2")}>
                  @{m.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          ref={ta}
          value={text}
          autoFocus={autoFocus}
          rows={1}
          maxLength={MESSAGE_MAX_LENGTH + 100}
          aria-label={placeholder}
          placeholder={placeholder}
          className="block max-h-48 min-h-11 w-full resize-none bg-transparent px-3.5 py-2.5 text-sm outline-none placeholder:text-muted/70"
          onChange={(e) => {
            setText(e.target.value);
            updateQuery(e.target.value, e.target.selectionStart);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(192, e.target.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            if (suggestions.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); const s = suggestions[active]; if (s) pick(s); return; }
              if (e.key === "Escape") { setQuery(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="flex items-center gap-1">
            {canShare ? (
              <>
                <input ref={fileRef} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="cowork-file-input" />
                <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Anexar arquivo" title="Anexar arquivo (até 8 MB)">
                  <Paperclip className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={() => setSharing(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Compartilhar cliente, processo, documento ou tarefa" title="Compartilhar item do LegalOS" data-testid="cowork-share-button">
                  <Link2 className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : null}
            <span className="hidden text-[11px] text-muted sm:inline">Enter envia · Shift+Enter quebra linha · @ menciona</span>
          </div>
          <button type="button" onClick={submit} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-50" disabled={!text.trim() && !files.length && !resources.length} data-testid="cowork-send">
            <Send className="h-3.5 w-3.5" aria-hidden /> Enviar
          </button>
        </div>
      </div>
      {error ? <p className="mt-1.5 text-xs text-danger" role="alert">{error}</p> : null}
      {sharing ? (
        <SharePicker
          onClose={() => setSharing(false)}
          onPick={(r) => {
            setResources((prev) => (prev.some((p) => p.kind === r.kind && p.resourceId === r.resourceId) || prev.length >= 10 ? prev : [...prev, r]));
            setSharing(false);
            ta.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** Busca do que compartilhar: o servidor só devolve itens que a pessoa pode ver. */
export function SharePicker({ onClose, onPick, kinds = RESOURCE_KINDS }: { onClose: () => void; onPick: (r: { kind: string; resourceId: string; title: string }) => void; kinds?: readonly ResourceKind[] }) {
  const [kind, setKind] = React.useState<ResourceKind>(kinds[0] ?? "CASE");
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<{ kind: ResourceKind; id: string; title: string; subtitle: string | null }[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      fetchJson<{ results: typeof results }>(`/api/cowork/resources?kind=${kind}&q=${encodeURIComponent(q)}`)
        .then((d) => alive && setResults(d.results))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [kind, q]);
  return (
    <Modal title="Compartilhar item do LegalOS" onClose={onClose}>
      <p className="mb-3 text-xs text-muted">O item é compartilhado como cartão: nada é copiado. Quem abrir precisa ter acesso ao item original — processos sigilosos continuam protegidos.</p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
        {kinds.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={k === kind} onClick={() => setKind(k)} className={cn("rounded-full border px-2.5 py-1 text-xs", k === kind ? "border-primary bg-primary/10 text-primary-text" : "border-border text-muted hover:bg-surface-2")}>
            {RESOURCE_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo nome, título ou número" aria-label="Buscar item" className="h-10 w-full rounded-lg border border-border bg-bg/45 px-3 text-sm focus:border-primary focus:outline-none" />
      <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-busy={loading}>
        {results.length === 0 ? <li className="px-3 py-6 text-center text-xs text-muted">{loading ? "Buscando…" : "Nada encontrado entre os itens que você pode ver."}</li> : null}
        {results.map((r) => (
          <li key={`${r.kind}:${r.id}`}>
            <button type="button" onClick={() => onPick({ kind: r.kind, resourceId: r.id, title: r.title })} className="w-full px-3 py-2 text-left hover:bg-surface-2" data-testid="cowork-share-result">
              <span className="block truncate text-sm">{r.title}</span>
              {r.subtitle ? <span className="block truncate text-xs text-muted">{r.subtitle}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
