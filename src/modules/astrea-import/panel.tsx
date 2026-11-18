"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ImportReport } from "@/server/import/astrea-import";

type ApiResult = { id?: string; report?: ImportReport; error?: string };
const labels: Record<string, string> = { clientes: "Clientes", processos: "Processos", prazos: "Prazos", tarefas: "Tarefas", agenda: "Agenda e audiências", intimacoes: "Publicações", andamentos: "Andamentos", documentos: "Links de documentos", financeiro: "Financeiro" };

export function AstreaImportPanel() {
  const [file, setFile] = React.useState<File | null>(null);
  const [id, setId] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  async function discard() {
    if (id) { const body = new FormData(); body.set("action", "discard"); body.set("id", id); await fetch("/api/import/astrea", { method: "POST", body }).catch(() => undefined); }
    setId(null); setReport(null); setConfirmed(false);
  }

  async function send(action: "preview" | "import") {
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.set("action", action);
      if (action === "preview") { if (!file) throw new Error("Selecione o ZIP do backup."); body.set("file", file); }
      else { if (!id) throw new Error("Faça a simulação antes de importar."); body.set("id", id); }
      const res = await fetch("/api/import/astrea", { method: "POST", body });
      const data = await res.json() as ApiResult;
      if (!res.ok) throw new Error(data.error ?? "Não foi possível processar o ZIP.");
      setReport(data.report ?? null);
      if (action === "preview") setId(data.id ?? null); else { setDone(true); setId(null); setConfirmed(false); }
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao importar o backup."); }
    finally { setBusy(false); }
  }

  return <div className="max-w-3xl space-y-4">
    <Card className="space-y-4 p-5">
      <div><h2 className="font-semibold">Enviar arquivo ZIP</h2><p className="mt-1 text-sm text-muted">Selecione o ZIP exportado pelo Astrea. O sistema simula a importação antes de gravar e evita repetir itens já importados por este fluxo.</p></div>
      <input type="file" accept=".zip,application/zip" onChange={(e) => { void discard(); setFile(e.target.files?.[0] ?? null); setDone(false); }} aria-label="Arquivo ZIP do backup Astrea" />
      <p className="text-xs text-muted">Arquivo ZIP de até 160 MB. O original não é alterado; a cópia temporária é removida depois da importação ou após duas horas.</p>
      {file ? <p className="text-xs text-muted">{file.name} · {(file.size / 1048576).toFixed(1)} MB</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">Importação concluída. Os arquivos temporários do backup foram removidos do servidor.</Alert> : null}
      {!id ? <Button loading={busy} disabled={!file || busy} onClick={() => void send("preview")}>Simular importação</Button> : <div className="space-y-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Conferi a prévia e autorizo importar estes dados para este escritório.</label><div className="flex flex-wrap gap-2"><Button variant="danger" loading={busy} disabled={busy || !confirmed} onClick={() => void send("import")}>Importar dados simulados</Button><Button variant="secondary" disabled={busy} onClick={() => void discard()}>Cancelar simulação</Button></div></div>}
    </Card>
    {report ? <Card className="space-y-3 p-5"><h2 className="font-semibold">{done ? "Resultado da importação" : "Prévia da importação"}</h2><p className="text-sm text-muted">{done ? "Registros gravados" : "Registros que serão criados"}. O importador identifica os itens de uma importação Astrea anterior.</p><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted"><th className="py-2">Tipo de dado</th><th className="py-2">No arquivo</th><th className="py-2">Novos</th><th className="py-2">Já importados</th></tr></thead><tbody>{Object.entries(report.entidades).map(([key, value]) => value ? <tr key={key} className="border-b border-border"><td className="py-2">{labels[key] ?? key}</td><td>{value.lidos}</td><td>{value.importados}</td><td>{value.jaImportados}</td></tr> : null)}</tbody></table></div>{Object.values(report.entidades).some(v => v && (Object.keys(v.avisos).length || Object.keys(v.ignorados).length)) ? <details><summary className="cursor-pointer text-sm">Avisos e itens ignorados</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{Object.entries(report.entidades).flatMap(([entity, value]) => value ? [...Object.entries(value.avisos).map(([reason,count]) => `${labels[entity] ?? entity}: ${reason} (${count})`), ...Object.entries(value.ignorados).map(([reason,count]) => `${labels[entity] ?? entity}: ignorados — ${reason} (${count})`)] : []).map(item => <li key={item}>{item}</li>)}</ul></details> : null}{!done && report.naoImportado.length ? <details><summary className="cursor-pointer text-sm">O que não entra nesta importação</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{report.naoImportado.map(item => <li key={item}>{item}</li>)}</ul></details> : null}</Card> : null}
  </div>;
}
