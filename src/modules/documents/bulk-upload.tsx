"use client";

import { CheckCircle2, FileArchive, FolderOpen, Link2, Loader2, RotateCcw, Upload, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { formatBytes } from "@/lib/format/phone";
import { cn } from "@/lib/utils";
import {
  BULK_ACCEPTED_EXTENSIONS,
  BULK_MAX_FILES,
  BULK_MAX_ZIP_BYTES,
  fileExtension,
  isJunkPath,
  rejectReason,
  type BulkOwner,
} from "@/lib/documents/bulk-match";
import { ClientPicker } from "@/modules/clients/client-picker";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL } from "./schemas";
import { listClientCasesForBulkAction, planBulkUploadAction, undoBulkUploadAction } from "./bulk-actions";
import type { BulkDuplicate } from "@/server/services/document-bulk.service";

type Status = "waiting" | "sending" | "done" | "error";
type Item = {
  key: string;
  path: string;
  size: number;
  blob: Blob;
  reject: string | null;
  sha256?: string;
  reason?: string;
  duplicate?: BulkDuplicate | null;
  owner: BulkOwner | null;
  include: boolean;
  status: Status;
  error?: string;
  documentId?: string;
};
type Filter = "all" | "unlinked" | "duplicate" | "rejected" | "error";

const ACCEPT_FILES = BULK_ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");
const CONCURRENCY = 3;
const EMPTY_HASH = "0".repeat(64);

async function sha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) return EMPTY_HASH; // sem contexto seguro: segue sem detectar duplicados
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

let keySeq = 0;
const nextKey = () => `bulk-${++keySeq}`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Caminho relativo do arquivo (pasta escolhida pelo seletor de pasta) ou só o nome. */
const relativePath = (file: File) => (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

async function expandZip(zipFile: File): Promise<{ path: string; blob: Blob; size: number }[]> {
  if (zipFile.size > BULK_MAX_ZIP_BYTES) throw new Error(`O ZIP ${zipFile.name} passa de ${formatBytes(BULK_MAX_ZIP_BYTES)}. Divida em partes menores.`);
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(zipFile).catch(() => {
    throw new Error(`Não foi possível abrir o ZIP ${zipFile.name}. Confira se o arquivo não está danificado ou protegido por senha.`);
  });
  const base = zipFile.name.replace(/\.zip$/i, "");
  const out: { path: string; blob: Blob; size: number }[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const path = `${base}/${entry.name}`;
    if (isJunkPath(path)) continue;
    if (out.length >= BULK_MAX_FILES * 2) break; // proteção contra ZIPs gigantes; o limite real é aplicado depois
    const blob = await entry.async("blob");
    out.push({ path, blob, size: blob.size });
  }
  return out;
}

function ownerText(owner: BulkOwner) {
  return `${owner.kind === "case" ? "Processo" : "Cliente"}: ${owner.label}`;
}

/** Escolher cliente e, opcionalmente, um processo desse cliente. */
function OwnerEditor({ id, onApply, onCancel, applyLabel = "Aplicar" }: { id: string; onApply: (owner: BulkOwner) => void; onCancel: () => void; applyLabel?: string }) {
  const [clientId, setClientId] = React.useState("");
  const [clientLabel, setClientLabel] = React.useState("");
  const [cases, setCases] = React.useState<{ id: string; number: string | null; title: string }[]>([]);
  const [caseId, setCaseId] = React.useState("");
  const [loading, startLoading] = React.useTransition();

  function pickClient(nextId: string, label: string) {
    setClientId(nextId);
    setClientLabel(label);
    setCaseId("");
    setCases([]);
    if (!nextId) return;
    startLoading(async () => {
      const result = await listClientCasesForBulkAction(nextId);
      if (result.ok && result.data) setCases(result.data);
    });
  }

  function apply() {
    const picked = cases.find((c) => c.id === caseId);
    if (picked) onApply({ kind: "case", id: picked.id, label: picked.number ? `${picked.number} · ${picked.title}` : picked.title });
    else if (clientId) onApply({ kind: "client", id: clientId, label: clientLabel });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface-2/40 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <Field label="Cliente" htmlFor={`${id}-client`}>
        <ClientPicker id={`${id}-client`} value={clientId} label={clientLabel} onChange={pickClient} />
      </Field>
      <Field label="Processo do cliente (opcional)" htmlFor={`${id}-case`} hint={loading ? "Carregando processos…" : clientId && !cases.length ? "Nenhum processo deste cliente: o arquivo fica na ficha do cliente." : undefined}>
        <Select id={`${id}-case`} value={caseId} disabled={!clientId || loading || !cases.length} onChange={(e) => setCaseId(e.target.value)}>
          <option value="">Só no cliente</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.number ? `${c.number} · ${c.title}` : c.title}</option>)}
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button size="sm" disabled={!clientId || loading} onClick={apply}>{applyLabel}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

export function BulkUpload() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [phase, setPhase] = React.useState<"select" | "reading" | "review" | "sending" | "done">("select");
  const [readingProgress, setReadingProgress] = React.useState({ done: 0, total: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [storage, setStorage] = React.useState<{ usedBytes: number; limitBytes: number | null } | null>(null);
  const [category, setCategory] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [editing, setEditing] = React.useState<string | null>(null);
  const [bulkEditing, setBulkEditing] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [undoAsk, setUndoAsk] = React.useState(false);
  const [undoing, startUndo] = React.useTransition();
  const [undone, setUndone] = React.useState<{ removed: number; kept: number } | null>(null);
  const filesRef = React.useRef<HTMLInputElement>(null);
  const folderRef = React.useRef<HTMLInputElement>(null);
  const zipRef = React.useRef<HTMLInputElement>(null);
  const itemsRef = React.useRef<Item[]>([]);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  React.useEffect(() => {
    // O seletor de pasta é um atributo não padronizado (suportado por Chrome, Edge, Firefox e Safari).
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  React.useEffect(() => {
    if (phase !== "sending" && phase !== "reading") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const patch = (key: string, change: Partial<Item>) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));

  async function addFiles(list: File[]) {
    if (!list.length) return;
    setError(null);
    setNotice(null);
    setPhase("reading");
    try {
      const collected: { path: string; blob: Blob; size: number }[] = [];
      for (const file of list) {
        const path = relativePath(file);
        if (isJunkPath(path)) continue;
        if (fileExtension(file.name) === "zip") collected.push(...(await expandZip(file)));
        else collected.push({ path, blob: file, size: file.size });
      }
      const known = new Set(itemsRef.current.map((i) => `${i.path}:${i.size}`));
      const fresh = collected.filter((c) => !known.has(`${c.path}:${c.size}`));
      const room = BULK_MAX_FILES - itemsRef.current.length;
      if (fresh.length > room) setNotice(`Cada envio aceita até ${BULK_MAX_FILES} arquivos. ${fresh.length - Math.max(room, 0)} ficaram de fora: envie-os depois, em um novo lote.`);
      const accepted = fresh.slice(0, Math.max(room, 0));

      setReadingProgress({ done: 0, total: accepted.length });
      const next: Item[] = [];
      for (const [index, c] of accepted.entries()) {
        const reject = rejectReason(c.path, c.size);
        next.push({ key: nextKey(), path: c.path, size: c.size, blob: c.blob, reject, sha256: reject ? undefined : await sha256(c.blob), owner: null, include: !reject, status: "waiting" });
        setReadingProgress({ done: index + 1, total: accepted.length });
      }
      const all = [...itemsRef.current, ...next];
      await analyze(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler os arquivos.");
      setPhase(itemsRef.current.length ? "review" : "select");
    }
  }

  async function analyze(all: Item[]) {
    const candidates = all.filter((i) => !i.reject && i.sha256);
    if (!candidates.length) {
      setItems(all);
      setPhase(all.length ? "review" : "select");
      if (all.length) setError("Nenhum dos arquivos tem um formato aceito.");
      return;
    }
    const result = await planBulkUploadAction(candidates.map((i) => ({ path: i.path, sha256: i.sha256!, size: i.size })));
    if (!result.ok || !result.data) {
      setItems(all);
      setError(result.message ?? "Não foi possível analisar os arquivos.");
      setPhase("review");
      return;
    }
    const byKey = new Map(candidates.map((item, index) => [item.key, result.data!.rows[index]!]));
    setStorage(result.data.storage);
    setItems(
      all.map((item) => {
        const row = byKey.get(item.key);
        if (!row) return item;
        // Mantém o vínculo que a pessoa já escolheu à mão em análises anteriores.
        const owner = item.reason === "Escolhido por você" ? item.owner : row.owner;
        const reason = item.reason === "Escolhido por você" ? item.reason : row.reason;
        const firstTime = item.duplicate === undefined;
        return { ...item, owner, reason, duplicate: row.duplicate, include: firstTime ? !row.duplicate : item.include };
      }),
    );
    setPhase("review");
  }

  function onPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(event.target.files ?? []);
    event.target.value = "";
    void addFiles(list);
  }

  const valid = items.filter((i) => !i.reject);
  const selected = valid.filter((i) => i.include && i.status !== "done");
  const unlinked = selected.filter((i) => !i.owner);
  const selectedBytes = selected.reduce((sum, i) => sum + i.size, 0);
  const overStorage = storage?.limitBytes != null && storage.usedBytes + selectedBytes > storage.limitBytes;
  const done = items.filter((i) => i.status === "done");
  const failed = items.filter((i) => i.status === "error");
  const counts = {
    all: items.length,
    unlinked: valid.filter((i) => !i.owner).length,
    duplicate: valid.filter((i) => i.duplicate).length,
    rejected: items.filter((i) => i.reject).length,
    error: failed.length,
  };
  const visible = items.filter((i) =>
    filter === "unlinked" ? !i.reject && !i.owner : filter === "duplicate" ? Boolean(i.duplicate) : filter === "rejected" ? Boolean(i.reject) : filter === "error" ? i.status === "error" : true,
  );
  const busy = phase === "reading" || phase === "sending";

  async function sendOne(item: Item) {
    const body = new FormData();
    body.set("file", item.blob, item.path.split("/").pop() ?? item.path);
    if (item.owner?.kind === "case") body.set("caseId", item.owner.id);
    if (item.owner?.kind === "client") body.set("clientId", item.owner.id);
    if (category) body.set("category", category);
    patch(item.key, { status: "sending", error: undefined });
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch("/api/documents/lote", { method: "POST", body });
        if (res.status === 429 && attempt < 3) {
          await wait(5000 * (attempt + 1));
          continue;
        }
        const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string; fieldErrors?: Record<string, string[]> };
        if (res.ok && json.id) patch(item.key, { status: "done", documentId: json.id });
        else patch(item.key, { status: "error", error: json.fieldErrors?.file?.[0] ?? json.error ?? "Não foi possível enviar." });
        return;
      } catch {
        if (attempt < 3) {
          await wait(2000);
          continue;
        }
        patch(item.key, { status: "error", error: "Falha de conexão. Tente de novo." });
        return;
      }
    }
  }

  async function sendAll(queue: Item[]) {
    setError(null);
    setUndone(null);
    setPhase("sending");
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const item = queue[next++]!;
        await sendOne(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setPhase("done");
  }

  function undo() {
    const ids = itemsRef.current.filter((i) => i.status === "done" && i.documentId).map((i) => i.documentId!);
    startUndo(async () => {
      const result = await undoBulkUploadAction(ids);
      setUndoAsk(false);
      if (!result.ok || !result.data) {
        setError(result.message ?? "Não foi possível desfazer.");
        return;
      }
      setUndone(result.data);
      setItems((current) => current.map((i) => (i.status === "done" ? { ...i, status: "waiting", documentId: undefined, include: false } : i)));
    });
  }

  function reset() {
    setItems([]);
    setStorage(null);
    setError(null);
    setNotice(null);
    setUndone(null);
    setFilter("all");
    setPhase("select");
  }

  const progressTotal = items.filter((i) => i.status !== "waiting" || (i.include && !i.reject)).length;
  const progressDone = items.filter((i) => i.status === "done" || i.status === "error").length;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="warning">{notice}</Alert> : null}

      {phase !== "sending" && phase !== "done" ? (
        <Card>
          <CardHeader title="1. Escolha os arquivos" description={`Arquivos soltos, uma pasta inteira (com subpastas) ou um ZIP. Até ${BULK_MAX_FILES} arquivos por envio, cada um com até 8 MB. Formatos: ${BULK_ACCEPTED_EXTENSIONS.join(", ")}.`} />
          <CardBody className="space-y-3">
            <div
              data-testid="bulk-dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy) void addFiles(Array.from(e.dataTransfer.files));
              }}
              className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center transition-colors", dragging && "border-primary bg-primary/5")}
            >
              <Upload aria-hidden className="h-6 w-6 text-muted" />
              <p className="text-sm text-muted">Arraste os arquivos ou um ZIP para cá, ou escolha:</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => filesRef.current?.click()}><Upload aria-hidden className="h-3.5 w-3.5" /> Arquivos</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => folderRef.current?.click()}><FolderOpen aria-hidden className="h-3.5 w-3.5" /> Uma pasta</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => zipRef.current?.click()}><FileArchive aria-hidden className="h-3.5 w-3.5" /> Um ZIP</Button>
              </div>
              <label className="sr-only" htmlFor="bulk-files">Escolher arquivos</label>
              <input ref={filesRef} id="bulk-files" type="file" multiple accept={ACCEPT_FILES} className="sr-only" onChange={onPicked} />
              <label className="sr-only" htmlFor="bulk-folder">Escolher uma pasta</label>
              <input ref={folderRef} id="bulk-folder" type="file" multiple className="sr-only" onChange={onPicked} />
              <label className="sr-only" htmlFor="bulk-zip">Escolher um ZIP</label>
              <input ref={zipRef} id="bulk-zip" type="file" accept=".zip,application/zip" className="sr-only" onChange={onPicked} />
              {phase === "reading" ? (
                <p className="flex items-center gap-2 text-sm" role="status"><Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Lendo arquivos{readingProgress.total ? ` (${readingProgress.done} de ${readingProgress.total})` : "…"}</p>
              ) : null}
            </div>
            <details className="text-sm text-muted">
              <summary className="cursor-pointer">Como o LegalOS descobre de quem é cada arquivo?</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Se o nome do arquivo ou da pasta tem o <strong>número do processo</strong> (CNJ), ele vai para esse processo.</li>
                <li>Se tem o <strong>CPF ou CNPJ</strong> de um cliente cadastrado, vai para a ficha desse cliente.</li>
                <li>Se a <strong>pasta tem o nome do cliente</strong> (ex.: &ldquo;Maria Silva&rdquo; ou &ldquo;Maria Silva - Trabalhista&rdquo;), vai para esse cliente.</li>
                <li>O que não for reconhecido fica marcado para você escolher. Nada é gravado antes da sua confirmação.</li>
              </ul>
            </details>
          </CardBody>
        </Card>
      ) : null}

      {items.length && phase !== "select" ? (
        <Card>
          <CardHeader
            title={phase === "review" || phase === "reading" ? "2. Confira antes de enviar" : phase === "sending" ? "Enviando…" : "Resultado do envio"}
            description={phase === "review" ? "Confira o vínculo de cada arquivo. Arquivos iguais a um que já está no LegalOS vêm desmarcados." : undefined}
            action={phase === "review" ? <Button size="sm" variant="ghost" onClick={reset}><RotateCcw aria-hidden className="h-3.5 w-3.5" /> Recomeçar</Button> : undefined}
          />
          <CardBody className="space-y-3">
            <p className="text-sm" data-testid="bulk-summary">
              {items.length} arquivo(s) · {selected.length} para enviar ({formatBytes(selectedBytes)}) · {counts.unlinked} sem vínculo · {counts.duplicate} já no LegalOS · {counts.rejected} recusado(s)
              {done.length ? ` · ${done.length} enviado(s)` : ""}
              {failed.length ? ` · ${failed.length} com erro` : ""}
            </p>

            {phase === "sending" || phase === "done" ? (
              <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Progresso do envio" aria-valuemin={0} aria-valuemax={progressTotal} aria-valuenow={progressDone}>
                <div className="h-full bg-primary transition-all" style={{ width: `${progressTotal ? Math.round((progressDone / progressTotal) * 100) : 0}%` }} />
              </div>
            ) : null}

            {phase === "review" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Categoria para todos (opcional)" htmlFor="bulk-category">
                  <Select id="bulk-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Sem categoria</option>
                    {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>)}
                  </Select>
                </Field>
                <Field label="Mostrar" htmlFor="bulk-filter">
                  <Select id="bulk-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                    <option value="all">Todos ({counts.all})</option>
                    <option value="unlinked">Sem vínculo ({counts.unlinked})</option>
                    <option value="duplicate">Já no LegalOS ({counts.duplicate})</option>
                    <option value="rejected">Recusados ({counts.rejected})</option>
                  </Select>
                </Field>
              </div>
            ) : null}

            {phase === "review" && counts.unlinked ? (
              bulkEditing ? (
                <OwnerEditor id="bulk-all" applyLabel={`Vincular ${counts.unlinked} arquivo(s)`} onCancel={() => setBulkEditing(false)} onApply={(owner) => {
                  setItems((current) => current.map((i) => (!i.reject && !i.owner ? { ...i, owner, reason: "Escolhido por você" } : i)));
                  setBulkEditing(false);
                }} />
              ) : (
                <Alert tone="warning">
                  {counts.unlinked} arquivo(s) sem cliente ou processo. Escolha um a um na lista ou{" "}
                  <button type="button" className="font-medium underline" onClick={() => setBulkEditing(true)}>vincule todos de uma vez</button>.
                </Alert>
              )
            ) : null}

            {overStorage && phase === "review" ? (
              <Alert tone="warning">O plano tem {formatBytes(storage!.limitBytes!)} de armazenamento e o escritório já usa {formatBytes(storage!.usedBytes)}. Os arquivos selecionados não cabem todos: desmarque alguns ou peça um plano maior.</Alert>
            ) : null}

            <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
              <ul className="divide-y divide-border text-sm">
                {visible.map((item) => (
                  <li key={item.key} className="space-y-2 px-3 py-2" data-testid="bulk-row">
                    <div className="flex flex-wrap items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        aria-label={`Enviar ${item.path}`}
                        checked={item.include && !item.reject}
                        disabled={Boolean(item.reject) || phase !== "review" || item.status === "done"}
                        onChange={(e) => patch(item.key, { include: e.target.checked })}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-all font-medium">{item.path}</p>
                        <p className="text-xs text-muted">
                          {formatBytes(item.size)}
                          {item.reject ? <span className="text-danger"> · {item.reject}</span> : null}
                          {item.duplicate ? <span className="text-warning"> · Já existe no {item.duplicate.where} como &ldquo;{item.duplicate.name}&rdquo;</span> : null}
                        </p>
                        {!item.reject ? (
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            {item.owner ? <Badge tone="info"><Link2 aria-hidden className="mr-1 inline h-3 w-3" />{ownerText(item.owner)}</Badge> : <Badge tone="warning">Sem vínculo</Badge>}
                            {item.reason ? <span className="text-muted">{item.reason}</span> : null}
                            {phase === "review" && item.status !== "done" ? (
                              <button type="button" className="text-primary-text underline" onClick={() => setEditing(editing === item.key ? null : item.key)}>
                                {item.owner ? "Trocar" : "Escolher"}
                              </button>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs" aria-live="polite">
                        {item.status === "sending" ? <span className="flex items-center gap-1 text-muted"><Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> Enviando</span> : null}
                        {item.status === "done" ? <span className="flex items-center gap-1 text-success"><CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> Enviado</span> : null}
                        {item.status === "error" ? <span className="flex items-center gap-1 text-danger"><XCircle aria-hidden className="h-3.5 w-3.5" /> {item.error}</span> : null}
                      </span>
                    </div>
                    {editing === item.key ? (
                      <OwnerEditor id={`edit-${item.key}`} onCancel={() => setEditing(null)} onApply={(owner) => {
                        patch(item.key, { owner, reason: "Escolhido por você", include: true });
                        setEditing(null);
                      }} />
                    ) : null}
                  </li>
                ))}
                {!visible.length ? <li className="px-3 py-6 text-center text-muted">Nenhum arquivo neste filtro.</li> : null}
              </ul>
            </div>

            {phase === "review" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!selected.length || unlinked.length > 0} onClick={() => void sendAll(selected)}>
                  Enviar {selected.length} arquivo(s)
                </Button>
                {unlinked.length ? <span className="text-sm text-muted">Escolha o vínculo dos {unlinked.length} arquivo(s) marcados sem cliente ou processo, ou desmarque-os.</span> : null}
              </div>
            ) : null}

            {phase === "done" ? (
              <div className="space-y-3">
                {undone ? (
                  <Alert tone="success">Envio desfeito: {undone.removed} documento(s) removido(s){undone.kept ? `; ${undone.kept} mantido(s) porque já foram alterados ou usados em petição` : ""}.</Alert>
                ) : (
                  <Alert tone={failed.length ? "warning" : "success"}>
                    {done.length} arquivo(s) enviado(s){failed.length ? ` e ${failed.length} com erro (veja o motivo em cada linha)` : ""}. Eles já aparecem nas fichas dos clientes e processos.
                  </Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  {failed.length ? <Button variant="secondary" onClick={() => void sendAll(failed)}>Tentar de novo os {failed.length} com erro</Button> : null}
                  <Link href="/documentos" className="inline-flex h-10 items-center rounded-md border border-border bg-surface-2 px-4 text-sm hover:bg-surface-3">Ver documentos</Link>
                  <Button variant="ghost" onClick={reset}>Novo envio</Button>
                  {done.length && !undone ? (
                    undoAsk ? (
                      <span className="flex flex-wrap items-center gap-2 text-sm">
                        Remover os {done.length} documento(s) deste envio?
                        <Button size="sm" variant="danger" loading={undoing} onClick={undo}>Sim, desfazer</Button>
                        <Button size="sm" variant="ghost" disabled={undoing} onClick={() => setUndoAsk(false)}>Não</Button>
                      </span>
                    ) : (
                      <Button variant="ghost" onClick={() => setUndoAsk(true)}><RotateCcw aria-hidden className="h-3.5 w-3.5" /> Desfazer este envio</Button>
                    )
                  ) : null}
                </div>
                {done.length && !undone ? <p className="text-xs text-muted">Dá para desfazer nas próximas 24 horas enquanto esta página estiver aberta. Documentos que você já editou ou usou em petição são mantidos.</p> : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
