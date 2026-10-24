"use client";
import * as React from "react";
import { Card,CardBody,CardHeader } from "@/components/ui/card";
import { Input,Textarea,Select,Field } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useRun } from "@/modules/kanban/use-run";
import type { ActivityKind } from "@/server/services/activity.service";
import { checklistCreateAction,checklistItemAction,collaboratorAction } from "./actions";
type Details={checklists:{id:string;title:string;items:{id:string;body:string;done:boolean}[]}[];collaborators:{id:string;name:string}[]};
export function ActivityDetailsUi({kind,id,data,members,canWrite}:{kind:ActivityKind;id:string;data:Details;members:{id:string;name:string}[];canWrite:boolean}){
  const {run,pending,error}=useRun();
  const [title,setTitle]=React.useState("");const [items,setItems]=React.useState("");const [person,setPerson]=React.useState("");
  return <div className="mt-4 grid gap-4 md:grid-cols-2">
    <Card><CardHeader title="Checklists" description="Acompanhe etapas sem criar tarefas separadas. Até cinco listas de 30 itens."/><CardBody className="space-y-4">
      {error?<Alert tone="error">{error}</Alert>:null}
      {data.checklists.map(c=>{const done=c.items.filter(i=>i.done).length;return <section key={c.id} aria-label={c.title}><h3 className="text-sm font-medium">{c.title} · {done}/{c.items.length}</h3><progress className="my-2 w-full accent-primary" value={done} max={c.items.length} aria-label={`Progresso de ${c.title}`}/><ul className="space-y-2">{c.items.map(item=><li key={item.id}><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={item.done} disabled={pending||!canWrite} onChange={e=>run(()=>checklistItemAction(item.id,e.target.checked))}/><span className={item.done?"text-muted line-through":""}>{item.body}</span></label></li>)}</ul></section>})}
      {!data.checklists.length?<p className="text-sm text-muted">Nenhum checklist.</p>:null}
      {canWrite&&data.checklists.length<5?<form className="space-y-2 border-t border-border pt-3" onSubmit={e=>{e.preventDefault();run(()=>checklistCreateAction(kind,id,{title,items:items.split("\n").map(s=>s.trim()).filter(Boolean)}),undefined,()=>{setTitle("");setItems("");});}}><Field label="Título do checklist" htmlFor="check-title"><Input id="check-title" value={title} maxLength={100} onChange={e=>setTitle(e.target.value)} /></Field><Field label="Itens (um por linha)" htmlFor="check-items"><Textarea id="check-items" value={items} rows={4} onChange={e=>setItems(e.target.value)}/></Field><Button type="submit" size="sm" loading={pending}>Adicionar checklist</Button></form>:null}
    </CardBody></Card>
    <Card><CardHeader title="Colaboradores" description="Participar não concede acesso a processos sigilosos nem substitui o responsável."/><CardBody className="space-y-3"><ul className="space-y-2">{data.collaborators.map(p=><li key={p.id} className="flex items-center justify-between gap-2 text-sm"><span>{p.name}</span>{canWrite?<Button size="sm" variant="ghost" disabled={pending} onClick={()=>run(()=>collaboratorAction(kind,id,p.id,false))}>Remover {p.name}</Button>:null}</li>)}</ul>{!data.collaborators.length?<p className="text-sm text-muted">Nenhum colaborador.</p>:null}{canWrite?<form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();run(()=>collaboratorAction(kind,id,person,true),undefined,()=>setPerson(""));}}><Field label="Adicionar colaborador" htmlFor="activity-person"><Select id="activity-person" value={person} onChange={e=>setPerson(e.target.value)}><option value="">Escolha</option>{members.filter(m=>!data.collaborators.some(p=>p.id===m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field><Button type="submit" size="sm" loading={pending} disabled={!person}>Adicionar pessoa</Button></form>:null}</CardBody></Card>
  </div>;
}
