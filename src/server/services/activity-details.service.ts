import { z } from "zod";
import { db } from "@/lib/db/client";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { ACTIVITY_KINDS, type ActivityKind } from "./activity.service";
import { getTask } from "./task.service";
import { getEvent } from "./agenda.service";
import { getDeadline } from "./deadline.service";
import { assertActiveMember } from "./case.service";
import { userNames } from "./members";
import { audit } from "./audit.service";

export async function activityAccess(ctx: TenantContext, kind: ActivityKind, id: string, write = false) {
  z.enum(ACTIVITY_KINDS).parse(kind); z.uuid().parse(id);
  if (write) {
    if (kind === "TASK") assertCan(ctx,"tasks:write");
    else if (kind === "DEADLINE") assertCan(ctx,"deadlines:write");
    else if (!ctx.permissions.has("tasks:write")) assertCan(ctx,"deadlines:write");
  }
  return kind === "TASK" ? getTask(ctx,id) : kind === "EVENT" ? getEvent(ctx,id) : getDeadline(ctx,id);
}
export async function activityDetails(ctx: TenantContext, kind: ActivityKind, id: string) {
  await activityAccess(ctx,kind,id);
  const where = { organizationId:ctx.organizationId,activityKind:kind,activityId:id };
  const [checklists,participants] = await Promise.all([
    db.activityChecklist.findMany({ where,orderBy:[{createdAt:"asc"},{id:"asc"}],include:{items:{orderBy:[{position:"asc"},{id:"asc"}]}} }),
    db.activityCollaborator.findMany({where,orderBy:{createdAt:"asc"}}),
  ]);
  const names=await userNames(ctx,participants.map(p=>p.userId));
  return { checklists:checklists.map(c=>({id:c.id,title:c.title,items:c.items.map(i=>({id:i.id,body:i.body,done:i.done}))})),collaborators:participants.map(p=>({id:p.userId,name:names.get(p.userId) ?? "Usuário indisponível"})) };
}
export async function createActivityChecklist(ctx: TenantContext, kind: ActivityKind, id: string, raw: unknown) {
  await activityAccess(ctx,kind,id,true);
  const v=z.object({title:z.string().trim().min(2).max(100),items:z.array(z.string().trim().min(1).max(500)).min(1).max(30)}).parse(raw);
  const where={organizationId:ctx.organizationId,activityKind:kind,activityId:id};
  return db.$transaction(async tx=>{
    // Serializa inclusões na mesma atividade para manter o limite inclusive em cliques concorrentes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:${kind}:${id}`},0))`;
    if(await tx.activityChecklist.count({where})>=5) throw new ValidationError("No máximo cinco checklists por atividade.");
    const c=await tx.activityChecklist.create({data:{...where,title:v.title,items:{create:v.items.map((body,position)=>({body,position}))}}});
    await audit({action:"activity.checklist_create",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"activity_checklist",resourceId:c.id,meta:ctx.meta},tx);
    return c.id;
  });
}
export async function setChecklistItem(ctx: TenantContext, itemId: string, done: boolean) {
  z.uuid().parse(itemId); z.boolean().parse(done);
  const item=await db.activityChecklistItem.findFirst({where:{id:itemId,organizationId:ctx.organizationId},include:{checklist:true}});
  if(!item) throw new NotFoundError("Item não encontrado.");
  await activityAccess(ctx,item.checklist.activityKind as ActivityKind,item.checklist.activityId,true);
  await db.$transaction(async tx=>{
    await tx.activityChecklistItem.update({where:{id:item.id},data:{done}});
    await audit({action:"activity.checklist_item",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"activity_checklist",resourceId:item.checklistId,metadata:{itemId,done},meta:ctx.meta},tx);
  });
}
export async function addActivityCollaborator(ctx: TenantContext, kind: ActivityKind, id: string, userId: string) {
  const target=await activityAccess(ctx,kind,id,true); z.uuid().parse(userId);
  await assertActiveMember(ctx,userId);
  if(target.caseId){
    const kase=await db.case.findFirst({where:{id:target.caseId,organizationId:ctx.organizationId},select:{confidential:true,members:{where:{userId},select:{id:true}}}});
    const m=await db.membership.findFirst({where:{organizationId:ctx.organizationId,userId,status:"ACTIVE"},select:{role:{select:{permissions:true}}}});
    if(kase?.confidential && !kase.members.length && !m?.role.permissions.includes("organization:manage")) throw new ValidationError("A pessoa precisa ter acesso ao processo sigiloso antes de participar da atividade.");
  }
  await db.$transaction(async tx=>{
    await tx.activityCollaborator.createMany({data:[{organizationId:ctx.organizationId,activityKind:kind,activityId:id,userId}],skipDuplicates:true});
    await audit({action:"activity.collaborator_add",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:kind.toLowerCase(),resourceId:id,metadata:{collaboratorId:userId},meta:ctx.meta},tx);
  });
}
export async function removeActivityCollaborator(ctx: TenantContext, kind: ActivityKind, id: string, userId: string) {
  await activityAccess(ctx,kind,id,true); z.uuid().parse(userId);
  await db.$transaction(async tx=>{
    await tx.activityCollaborator.deleteMany({where:{organizationId:ctx.organizationId,activityKind:kind,activityId:id,userId}});
    await audit({action:"activity.collaborator_remove",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:kind.toLowerCase(),resourceId:id,metadata:{collaboratorId:userId},meta:ctx.meta},tx);
  });
}
