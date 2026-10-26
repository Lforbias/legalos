import type {Tx} from "@/lib/db/client";
import {ConflictError} from "@/lib/permissions/check";
import {todayYmd} from "@/lib/dates/ymd";
import {activityOffset} from "@/lib/activities/offset";
import type {TenantContext} from "@/server/context";
import {recordTaskEvent} from "./task-event";
export async function assertTaskReady(tx:Tx,ctx:TenantContext,id:string,status:string){
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:workflow-tasks`},0))`;
 if(status!=="IN_PROGRESS"&&status!=="DONE")return;
 const blocked=await tx.taskDependency.findFirst({where:{organizationId:ctx.organizationId,taskId:id,predecessor:{OR:[{status:{not:"DONE"}},{deletedAt:{not:null}}]}}});
 if(blocked)throw new ConflictError("Conclua a atividade anterior do workflow antes de iniciar ou concluir esta tarefa.");
}
export async function advanceTaskDependencies(tx:Tx,ctx:TenantContext,id:string,done:boolean){
 const deps=await tx.taskDependency.findMany({where:{organizationId:ctx.organizationId,predecessorId:id},include:{task:true,predecessor:true}});
 if(!done&&deps.some(d=>d.task.deletedAt===null&&(d.task.status==="IN_PROGRESS"||d.task.status==="DONE")))throw new ConflictError("Uma tarefa dependente já foi iniciada ou concluída. Revise o workflow antes de reabrir a anterior.");
 for(const d of deps){
  if(d.task.deletedAt||d.task.status==="CANCELED"||d.task.status==="DONE")continue;
  if(done&&d.task.status==="WAITING"){
   const due=d.onCompletion?activityOffset(todayYmd(ctx.timezone,d.predecessor.completedAt??new Date()),d.offsetDays,d.countType,d.nonWorkingDates):null;
   const changed=await tx.task.updateMany({where:{id:d.taskId,organizationId:ctx.organizationId,updatedAt:d.task.updatedAt,status:d.task.status,deletedAt:null},data:{status:"TODO",stageId:null,...(due?{dueDate:new Date(`${due}T00:00:00Z`)}:{})}});
   if(changed.count!==1)throw new ConflictError("A atividade dependente mudou. Recarregue e tente novamente.");
   await recordTaskEvent(tx,ctx,d.taskId,"workflow_ready","Etapa anterior concluída; tarefa liberada.");
  }else if(!done&&d.task.status==="TODO"){
   const changed=await tx.task.updateMany({where:{id:d.taskId,organizationId:ctx.organizationId,updatedAt:d.task.updatedAt,status:d.task.status,deletedAt:null},data:{status:"WAITING",stageId:null,...(d.onCompletion?{dueDate:null}:{})}});
   if(changed.count!==1)throw new ConflictError("A atividade dependente mudou. Recarregue e tente novamente.");
   await recordTaskEvent(tx,ctx,d.taskId,"workflow_waiting","Etapa anterior reaberta; tarefa aguardando dependência.");
  }
 }
}
