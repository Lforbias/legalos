"use client";
import { useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { viewHref,type ChatResource } from "@/lib/whatsapp/workbench";
import { resourceAction,removeResourceAction,assistSwitchAction } from "./workbench-actions";

export function WorkbenchManager({resources,enabled,manage,queues,labels}:{resources:ChatResource[];enabled:boolean;manage:boolean;queues:{id:string;name:string}[];labels:{id:string;name:string}[]}) {
  const [pending,start]=useTransition(),[message,setMessage]=useState("");const router=useRouter();
  const [kind,setKind]=useState(manage?"KNOWLEDGE":"VIEW"),[name,setName]=useState(""),[body,setBody]=useState(""),[draft,setDraft]=useState(""),[queueId,setQueueId]=useState(""),[status,setStatus]=useState(""),[labelIds,setLabels]=useState<string[]>([]),[view,setView]=useState("/atendimento?f=mine");
  const run=(fn:()=>Promise<{ok:boolean;message?:string}>)=>start(async()=>{try{const r=await fn();setMessage(r.ok?"Configuração salva.":r.message??"Não foi possível salvar.");if(r.ok)router.refresh();}catch{setMessage("Falha de conexão. Confira o resultado antes de repetir.");}});
  const field="w-full rounded-lg border border-border bg-bg p-2 text-sm";
  function save() {
    let payload:unknown;
    if(kind==="KNOWLEDGE")payload={body};
    else if(kind==="MACRO")payload={note:body,draft,queueId:queueId||null,labelIds,...(status?{status}:{})};
    else {try{const url=new URL(view,window.location.origin);if(url.pathname!=="/atendimento")throw new Error();payload=Object.fromEntries(url.searchParams);}catch{setMessage("Use um endereço da caixa /atendimento com os filtros desejados.");return;}}
    run(()=>resourceAction({kind,name,payload}));
  }
  return <div className="space-y-6">
    {message&&<Alert tone="info">{message}</Alert>}
    <section className="rounded-xl border border-border bg-surface p-5"><h2 className="font-semibold">Copiloto do atendimento</h2><p className="my-3 text-sm text-muted">Sugestões de resposta, reescrita, tradução, sentimento, prioridade, fila e encerramento. Usa a IA configurada no escritório e os artigos desta base. O atendente revisa e envia.</p><p className="text-sm">Situação: {enabled?"Ligado":"Desligado"}</p>{manage&&<Button className="mt-3" size="sm" variant="secondary" loading={pending} onClick={()=>run(()=>assistSwitchAction(!enabled))}>{enabled?"Desligar copiloto":"Ligar copiloto"}</Button>} <Link className="ml-3 text-sm underline" href="/configuracoes/ia">Configuração da IA</Link></section>
    <section className="rounded-xl border border-border bg-surface p-5"><h2 className="font-semibold">Base do Chat, macros e listas salvas</h2><p className="my-3 text-sm text-muted">Artigos desta base podem ser enviados ao provedor de IA ao gerar sugestões. Cadastre orientações de atendimento sem dados de clientes. Salvar com o mesmo nome atualiza o recurso existente.</p>
      <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Tipo<select className={field} value={kind} onChange={e=>setKind(e.target.value)}>{manage&&<><option value="KNOWLEDGE">Artigo da base</option><option value="MACRO">Macro</option></>}<option value="VIEW">Lista filtrada compartilhada</option></select></label><label className="text-sm">Nome<input className={field} value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label></div>
      {kind!=="VIEW"?<label className="mt-3 block text-sm">{kind==="KNOWLEDGE"?"Orientação aprovada para o copiloto":"Nota interna da macro"}<textarea className={field} rows={5} value={body} onChange={e=>setBody(e.target.value)} maxLength={kind==="KNOWLEDGE"?12000:1000}/></label>:<label className="mt-3 block text-sm">Endereço com filtros<input className={field} value={view} onChange={e=>setView(e.target.value)}/></label>}
      {kind==="MACRO"&&<div className="mt-3 space-y-3"><label className="block text-sm">Resposta a colocar no rascunho<textarea className={field} rows={3} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={4096}/></label><div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Fila<select className={field} value={queueId} onChange={e=>setQueueId(e.target.value)}><option value="">Manter atual</option>{queues.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}</select></label><label className="text-sm">Situação<select className={field} value={status} onChange={e=>setStatus(e.target.value)}><option value="">Manter atual</option>{[["OPEN","Aberta"],["IN_SERVICE","Em atendimento"],["WAITING","Aguardando"],["RESOLVED","Resolvida"],["CLOSED","Encerrada"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div><fieldset><legend className="text-sm">Adicionar etiquetas</legend><div className="flex flex-wrap gap-3">{labels.map(l=><label className="text-xs" key={l.id}><input type="checkbox" checked={labelIds.includes(l.id)} onChange={e=>setLabels(e.target.checked?[...labelIds,l.id]:labelIds.filter(x=>x!==l.id))}/> {l.name}</label>)}</div></fieldset><p className="text-xs text-muted">A macro aplica alterações internas. O texto fica no rascunho para envio manual. Encerrar por macro não dispara NPS.</p></div>}
      <Button className="mt-3" size="sm" loading={pending} disabled={name.trim().length<3||(!manage&&kind!=="VIEW")} onClick={save}>Salvar recurso</Button>
      <div className="mt-5 space-y-2">{resources.map(r=><article key={r.id} className="rounded-lg border border-border p-3"><p className="text-sm font-medium">{r.name} <span className="text-xs text-muted">· {r.kind==="KNOWLEDGE"?"Base":r.kind==="MACRO"?"Macro":"Lista"}</span></p>{r.kind==="VIEW"?<Link className="text-sm underline" href={viewHref(r.payload)}>Abrir lista</Link>:<p className="mt-2 whitespace-pre-wrap text-xs text-muted">{r.kind==="KNOWLEDGE"?String(r.payload.body):JSON.stringify(r.payload)}</p>}{manage&&<Button className="mt-2" size="sm" variant="ghost" loading={pending} onClick={()=>run(()=>removeResourceAction(r.id))}>Remover recurso</Button>}</article>)}</div>
    </section>
    <WhatsAppLink />
  </div>;
}
function WhatsAppLink() {
  const [phone,setPhone]=useState(""),[text,setText]=useState("");
  const digits=phone.replace(/\D/g,"");const valid=/^[1-9]\d{9,14}$/.test(digits);
  const href=valid?`https://wa.me/${digits}?text=${encodeURIComponent(text)}`:"";
  return <section className="rounded-xl border border-border bg-surface p-5"><h2 className="font-semibold">Link de atendimento para site e anúncios</h2><p className="my-3 text-sm text-muted">Informe o número com DDI e DDD. Inclua uma referência de campanha no texto se quiser identificá-la na conversa. O WhatsApp não repassa automaticamente UTMs da página.</p><div className="grid gap-3 md:grid-cols-2"><input className="rounded border border-border bg-bg p-2 text-sm" aria-label="Número com DDI" placeholder="5571999999999" value={phone} onChange={e=>setPhone(e.target.value)}/><input className="rounded border border-border bg-bg p-2 text-sm" aria-label="Mensagem do link" placeholder="Olá, vim da campanha..." value={text} onChange={e=>setText(e.target.value)} maxLength={1000}/></div>{valid&&<p className="mt-3 break-all text-sm"><a className="underline" href={href} target="_blank" rel="noreferrer">{href}</a></p>}</section>;
}
