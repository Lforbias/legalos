import {z} from "zod";
import {db,type Tx} from "@/lib/db/client";
import {ConflictError,ValidationError,NotFoundError} from "@/lib/permissions/check";
import {dateToYmd} from "@/lib/dates/ymd";
import {zonedToUtc} from "@/lib/dates/zoned";
import {recurrenceSchema,recurrenceDates,type RecurrenceRule} from "@/lib/activities/recurrence";
import type {TenantContext} from "@/server/context";
import {type ActivityKind} from "./activity.service";
import {activityAccess} from "./activity-details.service";
import {getTask} from "./task.service";
import {getEvent} from "./agenda.service";
import {assertActiveMember,logCaseEvent} from "./case.service";
import {audit} from "./audit.service";

async function copyDetails(tx:Tx,org:string,kind:string,from:string,to:string){
 const lists=await tx.activityChecklist.findMany({where:{organizationId:org,activityKind:kind,activityId:from},include:{items:true}});
 for(const list of lists) await tx.activityChecklist.create({data:{organizationId:org,activityKind:kind,activityId:to,title:list.title,items:{create:list.items.map(i=>({body:i.body,position:i.position,done:false}))}}});
 const people=await tx.activityCollaborator.findMany({where:{organizationId:org,activityKind:kind,activityId:from}});
 const active=await tx.membership.findMany({where:{organizationId:org,status:"ACTIVE",userId:{in:people.map(p=>p.userId)}},select:{userId:true}});
 const activeIds=new Set(active.map(m=>m.userId));
 if(people.length) await tx.activityCollaborator.createMany({data:people.filter(p=>activeIds.has(p.userId)).map(p=>({organizationId:org,activityKind:kind,activityId:to,userId:p.userId}))});
}
export async function getActivitySeries(ctx:TenantContext,kind:ActivityKind,id:string){
 await activityAccess(ctx,kind,id);
 const occurrence=await db.activityOccurrence.findUnique({where:{organizationId_activityKind_activityId:{organizationId:ctx.organizationId,activityKind:kind,activityId:id}},include:{series:{include:{_count:{select:{occurrences:true}}}}}});
 return occurrence?{id:occurrence.seriesId,date:dateToYmd(occurrence.date),rule:recurrenceSchema.parse(occurrence.series.rule),count:occurrence.series._count.occurrences}:null;
}
/** Materializa a série inteira numa transação. Reenvios sobre a mesma origem não duplicam ocorrências. */
export async function repeatActivity(ctx:TenantContext,kind:ActivityKind,id:string,raw:RecurrenceRule){
 z.enum(["TASK","EVENT"]).parse(kind);await activityAccess(ctx,kind,id,true);
 const rule=recurrenceSchema.parse(raw);
 const task=kind==="TASK"?await getTask(ctx,id):null;
 const event=kind==="EVENT"?await getEvent(ctx,id):null;
 const start=task?.dueDate?dateToYmd(task.dueDate):event?.date;
 if(!start) throw new ValidationError("Defina a data da atividade antes de repetir.");
 let dates:string[];try{dates=recurrenceDates(start,rule);}catch(e){throw new ValidationError(e instanceof Error?e.message:"Recorrência inválida.");}
 const copies=dates.filter(d=>d>start);
 if(copies.length>119)throw new ValidationError("No máximo 120 ocorrências incluindo a original.");
 if(!copies.length)throw new ValidationError("O período não gera novas ocorrências.");
 const assignee=task?.assigneeId??event?.assigneeId;
 if(assignee)await assertActiveMember(ctx,assignee);
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:${kind}:${id}`},0))`;
  const existing=await tx.activityOccurrence.findUnique({where:{organizationId_activityKind_activityId:{organizationId:ctx.organizationId,activityKind:kind,activityId:id}}});
  if(existing)throw new ConflictError("Esta atividade já pertence a uma série.");
  const fresh=task?await tx.task.findFirst({where:{id,organizationId:ctx.organizationId,updatedAt:task.updatedAt,deletedAt:null}}):await tx.agendaEvent.findFirst({where:{id,organizationId:ctx.organizationId,updatedAt:event!.updatedAt,deletedAt:null}});
  if(!fresh)throw new ConflictError("A atividade mudou. Recarregue antes de criar a série.");
  const series=await tx.activitySeries.create({data:{organizationId:ctx.organizationId,activityKind:kind,rule,createdById:ctx.userId}});
  await tx.activityOccurrence.create({data:{organizationId:ctx.organizationId,seriesId:series.id,activityKind:kind,activityId:id,date:new Date(`${start}T00:00:00Z`)}});
  const labels=task?await tx.taskLabelLink.findMany({where:{taskId:task.id,task:{organizationId:ctx.organizationId}},select:{labelId:true}}):[];
  for(const date of copies){
   const made=task?await tx.task.create({data:{organizationId:ctx.organizationId,title:task.title,description:task.description,priority:task.priority,status:"TODO",dueDate:new Date(`${date}T00:00:00Z`),assigneeId:task.assigneeId,caseId:task.caseId,clientId:task.clientId,createdById:ctx.userId,typeId:task.typeId}}):await tx.agendaEvent.create({data:{organizationId:ctx.organizationId,title:event!.title,description:event!.description,kind:event!.kind,allDay:event!.allDay,location:event!.location,caseId:event!.caseId,clientId:event!.clientId,assigneeId:event!.assigneeId,createdById:ctx.userId,startsAt:zonedToUtc(date,event!.allDay?"00:00":event!.startTime,ctx.timezone),endsAt:event!.endTime?zonedToUtc(date,event!.endTime,ctx.timezone):null}});
   if(task && labels.length)await tx.taskLabelLink.createMany({data:labels.map(l=>({taskId:made.id,labelId:l.labelId}))});
   if(task)await tx.taskEvent.create({data:{organizationId:ctx.organizationId,taskId:made.id,userId:ctx.userId,kind:"created",detail:"Criada por recorrência"}});
   await tx.activityOccurrence.create({data:{organizationId:ctx.organizationId,seriesId:series.id,activityKind:kind,activityId:made.id,date:new Date(`${date}T00:00:00Z`)}});
   await copyDetails(tx,ctx.organizationId,kind,id,made.id);
  }
  if(fresh.caseId)await logCaseEvent(tx,ctx,fresh.caseId,{kind:"ACTIVITY_SERIES",title:`Série criada: ${fresh.title}`,description:`${copies.length} novas ocorrências.`});
  await audit({action:"activity.series_create",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"activity_series",resourceId:series.id,metadata:{kind,sourceId:id,created:copies.length},meta:ctx.meta},tx);
  return {id:series.id,created:copies.length};
 },{timeout:60000});
}

export async function updateFollowingActivities(ctx:TenantContext,kind:ActivityKind,id:string,raw:unknown){
 const v=z.object({action:z.enum(["UPDATE","CANCEL"]),title:z.string().trim().min(3).max(200).optional(),description:z.string().trim().max(4000).optional()}).refine(v=>v.action==="CANCEL"||v.title!==undefined||v.description!==undefined,"Informe o título ou a descrição.").parse(raw);
 await activityAccess(ctx,kind,id,true);
 const current=await db.activityOccurrence.findUnique({where:{organizationId_activityKind_activityId:{organizationId:ctx.organizationId,activityKind:kind,activityId:id}}});
 if(!current)throw new NotFoundError("A atividade não pertence a uma série.");
 const rows=await db.activityOccurrence.findMany({where:{organizationId:ctx.organizationId,seriesId:current.seriesId,date:{gte:current.date}},orderBy:{date:"asc"}});
 const targets:{row:typeof rows[number];original:Awaited<ReturnType<typeof activityAccess>>}[]=[];for(const row of rows){
  const original=await activityAccess(ctx,kind,row.activityId,true).catch(()=>null);
  if(!original)throw new ConflictError("Uma ocorrência não está mais acessível. Revise a série antes de alterar.");
  if("status" in original && (original.status==="DONE"||original.status==="CANCELED"))continue;
  targets.push({row,original});
 }
 return db.$transaction(async tx=>{
  let count=0;
  for(const {row,original} of targets){
   const data=v.action==="CANCEL"?{status:"CANCELED" as const}:{...(v.title!==undefined?{title:v.title}:{}),...(v.description!==undefined?{description:v.description||null}:{})};
   const where={id:row.activityId,organizationId:ctx.organizationId,updatedAt:original.updatedAt,deletedAt:null};
   const result=kind==="TASK"?await tx.task.updateMany({where,data}):await tx.agendaEvent.updateMany({where,data});
   if(result.count!==1)throw new ConflictError("Uma ocorrência mudou. Recarregue antes de alterar a série.");
   count++;
  }
  await audit({action:v.action==="CANCEL"?"activity.series_cancel":"activity.series_update",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"activity_series",resourceId:current.seriesId,metadata:{from:id,count},meta:ctx.meta},tx);
  return {updated:count};
 },{timeout:30000});
}
