"use client";
import { useEffect,useRef,useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AI_MODES, type ChatResource } from "@/lib/whatsapp/workbench";
import { assistChatAction,chatPresenceAction,workspaceDataAction,macroAction,classificationAction,blockedAction,contactEventAction } from "./workbench-actions";

type Suggestion=NonNullable<Awaited<ReturnType<typeof assistChatAction>>["data"]>;
export function WorkbenchComposer({id,text,onDraft}:{id:string;text:string;onDraft:(text:string)=>void}) {
  const router=useRouter();const [pending,start]=useTransition();
  const [open,setOpen]=useState(false),[error,setError]=useState("");
  const [data,setData]=useState<NonNullable<Awaited<ReturnType<typeof workspaceDataAction>>["data"]>|null>(null);
  const [suggestion,setSuggestion]=useState<Suggestion|null>(null),[language,setLanguage]=useState("Português");
  const [mode,setMode]=useState<(typeof AI_MODES)[number]>("reply"),[macro,setMacro]=useState("");
  const [colleagues,setColleagues]=useState<{name:string;typing:boolean}[]>([]);
  const draftRef=useRef(text);
  const editedAt=useRef(0);
  useEffect(()=>{draftRef.current=text;editedAt.current=Date.now();},[text]);
  useEffect(()=>{
    let active=true;
    const heartbeat=async()=>{
      if(document.visibilityState!=="visible")return;
      const r=await chatPresenceAction(id,!!draftRef.current&&Date.now()-editedAt.current<15000).catch(()=>null);
      if(active&&r?.ok)setColleagues(r.data??[]);
    };
    void heartbeat();const timer=setInterval(()=>void heartbeat(),12000);
    return ()=>{active=false;clearInterval(timer);};
  },[id]);
  function load() {start(async()=>{const r=await workspaceDataAction(id);if(r.ok)setData(r.data??null);else setError(r.message??"Não foi possível carregar.");});}
  function run(fn:()=>Promise<{ok:boolean;message?:string}>) {start(async()=>{setError("");try{const r=await fn();if(!r.ok)setError(r.message??"Não foi possível concluir.");else {router.refresh();load();}}catch{setError("Falha de conexão. Confira o resultado antes de tentar novamente.");}});}
  return <div className="space-y-2">
    {colleagues.length>0&&<p role="status" className="text-xs text-warning">{colleagues.map(c=>`${c.name} ${c.typing?"está escrevendo":"também está neste atendimento"}`).join(" · ")}. Combine quem vai responder.</p>}
    <button type="button" className="text-xs font-medium text-primary-text underline" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)load();}}>Copiloto, macros e dados do atendimento</button>
    {open&&<div className="space-y-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap justify-between gap-2 text-xs"><span className="break-all">Protocolo: {data?.contact.protocol??"Carregando…"}</span><Link className="underline" href="/atendimento/operacoes">Configurar operações</Link></div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Ação do copiloto" className="rounded border border-border bg-bg px-2 py-1 text-sm" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}>
          <option value="reply">Sugerir resposta</option><option value="rewrite">Reescrever no tom do escritório</option><option value="translate">Traduzir o texto</option><option value="classify">Sugerir fila, prioridade e etiquetas</option><option value="closing">Sugerir encerramento</option>
        </select>
        {mode==="translate"&&<input className="rounded border border-border bg-bg px-2 text-sm" aria-label="Idioma da tradução" value={language} onChange={e=>setLanguage(e.target.value)} maxLength={40}/>}
        <Button size="sm" variant="secondary" loading={pending} onClick={()=>run(async()=>{const r=await assistChatAction({conversationId:id,mode,text,language});if(r.ok)setSuggestion(r.data??null);return r;})}>Gerar sugestão</Button>
      </div>
      <p className="text-xs text-muted">A IA usa até 40 mensagens e os artigos aprovados da base do Chat. Revise antes de aplicar ou enviar.</p>
      {suggestion?.text&&<div className="space-y-2 rounded border border-border p-3"><p className="whitespace-pre-wrap text-sm">{suggestion.text}</p><Button size="sm" variant="secondary" onClick={()=>onDraft(suggestion.text)}>Usar no rascunho</Button></div>}
      {suggestion?.classification&&<div className="space-y-2 rounded border border-border p-3 text-sm">
        <p>Prioridade: {suggestion.classification.priority} · Sentimento: {suggestion.classification.sentiment}</p><p>{suggestion.classification.reason}</p>
        <p>Fila sugerida: {suggestion.classification.queueId??"Manter atual"} · Etiquetas: {suggestion.classification.labelIds.length}</p>
        {suggestion.classification.closingReason&&<p>Motivo sugerido: {suggestion.classification.closingReason}</p>}
        <p className="text-xs text-muted">Confirmar aplica a fila e adiciona etiquetas e nota. O encerramento é feito pelo botão Encerrar.</p>
        <Button size="sm" variant="secondary" loading={pending} onClick={()=>run(()=>classificationAction(id,suggestion.classification))}>Confirmar classificação</Button>
      </div>}
      {suggestion&&<p className="text-xs text-muted">Base consultada: {suggestion.sources.map(s=>s.name).join(", ")||"nenhum artigo cadastrado"}.</p>}
      <div className="flex flex-wrap gap-2"><select aria-label="Macro" className="max-w-full rounded border border-border bg-bg px-2 py-1 text-sm" value={macro} onChange={e=>setMacro(e.target.value)}><option value="">Escolher macro</option>{data?.resources.filter(r=>r.kind==="MACRO").map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <Button size="sm" variant="secondary" disabled={!macro} loading={pending} onClick={()=>run(async()=>{const r=await macroAction(id,macro);if(r.ok&&r.data?.draft)onDraft(r.data.draft);return r;})}>Aplicar macro</Button></div>
      {macro&&<MacroPreview resource={data?.resources.find(r=>r.id===macro)}/>}
      {data?.payments.length? <details><summary className="cursor-pointer text-sm">Links de pagamento existentes (Asaas)</summary><p className="my-2 text-xs text-muted">Selecione para colocar no rascunho. Não cria nem envia uma nova cobrança.</p>{data.payments.map(p=><button type="button" key={p.id} className="mb-2 block text-sm underline" onClick={()=>onDraft(`Pagamento de R$ ${p.value} · vencimento ${p.dueDate}: ${p.url}`)}>R$ {p.value} · {p.dueDate} — usar link</button>)}</details>:null}
      <details><summary className="cursor-pointer text-sm">Contato, consentimento e origem</summary><ContactControls id={id} blocked={data?.contact.blocked??false} run={run} pending={pending}/>
        <ul className="mt-2 space-y-1 text-xs text-muted">{data?.contact.events.map(e=><li key={e.id}>{new Date(e.created_at).toLocaleString("pt-BR")} · {e.kind} · {JSON.stringify(e.payload)}</li>)}</ul>
      </details>
      {error&&<Alert tone="error">{error}</Alert>}
    </div>}
  </div>;
}
function MacroPreview({resource}:{resource?:ChatResource}) {return resource?<p className="whitespace-pre-wrap text-xs text-muted">Ações da macro: {JSON.stringify(resource.payload)}. O texto será colocado no rascunho; a macro não envia mensagens.</p>:null;}
function ContactControls({id,blocked,run,pending}:{id:string;blocked:boolean;run:(fn:()=>Promise<{ok:boolean;message?:string}>)=>void;pending:boolean}) {
  const [note,setNote]=useState(""),[kind,setKind]=useState("CONSENT");const [source,setSource]=useState(""),[campaign,setCampaign]=useState("");
  return <div className="mt-2 space-y-2">
    <input className="w-full rounded border border-border bg-bg p-2 text-sm" aria-label="Evidência ou motivo do registro" placeholder="Evidência do consentimento, pedido ou motivo do bloqueio" value={note} onChange={e=>setNote(e.target.value)} maxLength={1000}/>
    <select className="rounded border border-border bg-bg p-1 text-sm" aria-label="Tipo de registro do contato" value={kind} onChange={e=>setKind(e.target.value)}><option value="CONSENT">Registrar consentimento</option><option value="WITHDRAWAL">Retirada de consentimento de campanhas</option><option value="DELETION_REQUEST">Pedido de exclusão para análise</option></select>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" loading={pending} disabled={note.trim().length<5} onClick={()=>run(()=>contactEventAction(id,kind,{note}))}>Registrar evidência</Button><Button size="sm" variant="secondary" loading={pending} disabled={note.trim().length<5} onClick={()=>run(()=>blockedAction(id,!blocked,note))}>{blocked?"Desbloquear contato":"Marcar spam e bloquear envios"}</Button></div>
    <p className="text-xs text-muted">Pedidos de exclusão ficam registrados para análise de retenção. O bloqueio impede envios e respostas automáticas neste número; mensagens recebidas continuam no histórico.</p>
    <div className="flex flex-wrap gap-2"><input className="rounded border border-border bg-bg p-1 text-sm" aria-label="Origem UTM" placeholder="Origem (utm_source)" value={source} onChange={e=>setSource(e.target.value)} maxLength={120}/><input className="rounded border border-border bg-bg p-1 text-sm" aria-label="Campanha UTM" placeholder="Campanha (utm_campaign)" value={campaign} onChange={e=>setCampaign(e.target.value)} maxLength={120}/><Button size="sm" variant="secondary" loading={pending} disabled={!source} onClick={()=>run(()=>contactEventAction(id,"ATTRIBUTION",{source,campaign}))}>Registrar origem</Button></div>
  </div>;
}
