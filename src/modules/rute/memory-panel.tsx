"use client";
import * as React from "react";
import { Brain, Trash2 } from "lucide-react";
import { memoryListAction, memorySaveAction, memoryArchiveAction } from "./actions";
type Data = NonNullable<Awaited<ReturnType<typeof memoryListAction>>["data"]>;
export function MemoryPanel({ clientId, caseId, all = false }: {clientId: string | null; caseId: string | null; all?: boolean}) {
  const [data,setData] = React.useState<Data | null>(null), [body,setBody] = React.useState(""), [scope,setScope] = React.useState("personal"), [error,setError] = React.useState("");
  const [pending,start] = React.useTransition();
  async function load() { const r = await memoryListAction({clientId,caseId:clientId ? caseId : null,all}); if (r.ok && r.data) setData(r.data); else setError(r.message ?? "Não foi possível abrir as memórias."); }
  return <details className="rounded-xl border border-border bg-surface px-3 py-2 text-xs" onToggle={e=>{if(e.currentTarget.open && !data) start(load);}}>
    <summary className="flex cursor-pointer items-center gap-2"><Brain className="h-3.5 w-3.5" />Minhas memórias {data ? `(${data.memories.length})` : ""}</summary>
    <div className="mt-3 max-h-72 space-y-3 overflow-y-auto"><p className="leading-5 text-muted">Só você usa estas memórias. Salve preferências ou contexto que deseja levar para próximas conversas. A RUTE continua consultando os dados atuais e respeitando suas permissões. Retenção: {data?.retentionDays ?? "conforme governança"} dias.</p>
      {data?.memories.map(m=><div key={m.id} className="flex items-start gap-3 rounded-lg bg-surface-2 p-3"><div className="min-w-0 flex-1"><span className="text-[10px] uppercase text-muted">{m.case_id ? "Processo" : m.client_id ? "Cliente" : "Pessoal"}</span><p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p></div><button type="button" disabled={pending} aria-label="Remover memória" onClick={()=>start(async()=>{const r=await memoryArchiveAction(m.id);if(!r.ok)setError(r.message??"Não foi possível remover.");else await load();})} className="rounded p-1 text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
      <textarea aria-label="Nova memória pessoal" value={body} onChange={e=>setBody(e.target.value)} maxLength={1000} rows={2} placeholder="Ex.: Prefiro resumos curtos, com prioridade e próximos passos." className="w-full rounded-lg border border-border bg-surface p-3 text-fg" />
      <div className="flex flex-wrap gap-2"><select aria-label="Escopo da memória" value={scope} onChange={e=>setScope(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-2"><option value="personal">Pessoal · todas as minhas conversas</option>{clientId ? <option value="client">Só neste cliente</option> : null}{clientId && caseId ? <option value="case">Só neste processo</option> : null}</select><button type="button" disabled={pending || body.trim().length<3} onClick={()=>start(async()=>{setError("");const r=await memorySaveAction({body,clientId:scope==="personal"?null:clientId,caseId:scope==="case"?caseId:null});if(!r.ok)setError(r.message??"Não foi possível salvar.");else{setBody("");await load();}})} className="rounded-lg bg-primary px-3 py-2 font-medium text-primary-fg disabled:opacity-50">Salvar para próximas conversas</button></div>
      <p className="text-muted">Remover interrompe o uso futuro; não apaga respostas antigas que já utilizaram a memória.</p>{error ? <p role="alert" className="text-danger">{error}</p> : null}
    </div>
  </details>;
}
