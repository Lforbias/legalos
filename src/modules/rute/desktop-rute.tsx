"use client";
import * as React from "react";
import { desktopAssistantAction } from "./actions";
import { Chat, RuteSetup, type Msg } from "./assistant-ui";
type Data = NonNullable<Awaited<ReturnType<typeof desktopAssistantAction>>["data"]>;
export function DesktopRute({ clientId, clientName, cases }: { clientId:string; clientName:string; cases:{id:string;title:string;number:string|null}[] }) {
  const [caseId,setCaseId] = React.useState(""), [selected,setSelected] = React.useState(""), [data,setData] = React.useState<Data|null>(null), [error,setError] = React.useState(""), [loading,setLoading] = React.useState(true), [generation,setGeneration]=React.useState(0);
  const sequence=React.useRef(0);
  const activeScope=React.useRef("");
  React.useEffect(()=>{activeScope.current=`${clientId}:${caseId}`;},[clientId,caseId]);
  const load = React.useCallback(async(id="")=>{
    const version=++sequence.current;setLoading(true);setError("");
    const r=await desktopAssistantAction({clientId,caseId:caseId||null,conversationId:id||undefined});
    if(version!==sequence.current)return;
    setLoading(false);if(!r.ok||!r.data){setError(r.message??"Não foi possível abrir a RUTE.");return;}setData(r.data);setSelected(id);
  },[clientId,caseId]);
  const invalidate=React.useCallback(()=>{sequence.current++;},[]);
  React.useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active)void load();});return()=>{active=false;invalidate();};},[load,invalidate]);
  const currentCase=cases.find(c=>c.id===caseId);
  return <section className="rounded-2xl border border-border bg-surface" aria-label="RUTE no Desktop">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5"><div><h2 className="text-xl font-medium tracking-tight">RUTE · {clientName}</h2><p className="mt-1 text-xs text-muted">Converse e trabalhe sem sair desta pasta. As permissões do seu perfil continuam valendo.</p></div><div className="flex gap-2"><select aria-label="Contexto da RUTE no Desktop" value={caseId} onChange={e=>{setCaseId(e.target.value);setSelected("");setData(null);}} className="max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="">Cliente · todos os seus casos</option>{cases.map(c=><option key={c.id} value={c.id}>{c.number??c.title}</option>)}</select><button type="button" onClick={()=>{setSelected("");setGeneration(g=>g+1);void load();}} className="rounded-lg border border-border px-3 py-2 text-xs">Nova conversa</button></div></header>
    <div className="grid grid-cols-[220px_minmax(0,1fr)]"><aside className="border-r border-border p-4"><p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Conversas neste contexto</p>{data?.conversations.map(c=><button key={c.id} type="button" onClick={()=>void load(c.id)} className={`mb-2 w-full rounded-lg p-3 text-left text-xs hover:bg-surface-2 ${selected===c.id?"bg-surface-2 font-medium":""}`}>{c.title}</button>)}{data?.conversations.length===0?<p className="text-xs text-muted">Sua primeira conversa aparecerá aqui.</p>:null}<p className="mt-5 text-[11px] leading-5 text-muted">O seletor mostra os processos recentes carregados nesta pasta. Uma nova conversa conserva o cliente e o processo escolhidos.</p></aside><div className="h-[760px] min-w-0 p-5">{loading?<p role="status" className="text-sm text-muted">Abrindo a RUTE…</p>:error?<p role="alert" className="text-sm text-danger">{error}</p>:data?.availability.available?<Chat key={`${clientId}:${caseId}:${generation}:${data.conversation?.id??"new"}`} embedded conversationId={data.conversation?.id??null} clientId={clientId} caseId={caseId||null} contextLabel={currentCase?`${clientName} · ${currentCase.title}`:clientName} messages={(data.conversation?.messages??[]) as Msg[]} onConversationCreated={id=>{if(activeScope.current!==`${clientId}:${caseId}`)return;setSelected(id);setData(old=>old?{...old,conversations:old.conversations.some(c=>c.id===id)?old.conversations:[{id,title:"Conversa atual"},...old.conversations]}:old);}} />:<RuteSetup reason={data?.availability.reason??"Configure a RUTE para começar."} />}</div></div>
  </section>;
}
