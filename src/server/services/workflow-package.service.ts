import { notify } from "./notification.service";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { packageSchema, runSchema, SEED_PACKAGES, type PackageInput, type RunInput } from "@/modules/kanban/package-schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertActiveMember, assertCaseVisible } from "./case.service";
import { activityOffset } from "@/lib/activities/offset";
import { recordTaskEvent } from "./task-event";
import { logCaseEvent } from "./case.service";
import { getClient } from "./client.service";

/**
 * 2.0-F3 — pacotes de tarefas ("workflows" prontos do escritório). Um pacote é uma lista editável de tarefas com prazo em
 * dias a partir de uma data base. Executar cria as tarefas de uma vez (sempre por decisão de uma pessoa; nada é automático).
 * Ver = tasks:read; editar pacotes = organization:manage; executar = tasks:write.
 */
export async function ensureSeedPackages(organizationId: string) {
  const have = await db.workflowPackage.findMany({ where: { organizationId, seedKey: { not: null } }, select: { seedKey: true } });
  const has = new Set(have.map((h) => h.seedKey));
  for (const s of SEED_PACKAGES) {
    if (has.has(s.key)) continue;
    await db.workflowPackage
      .create({
        data: {
          organizationId, seedKey: s.key, name: s.name, description: s.description,
          steps: { create: s.steps.map((st, i) => ({ organizationId, position: i, title: st.title, description: st.description ?? null, dueDays: st.dueDays, priority: st.priority ?? "NORMAL", ask: st.ask ?? null })) },
        },
      })
      .catch(() => null); // corrida: outra requisição criou primeiro (índice único em seed_key)
  }
}

export async function listPackages(ctx: TenantContext, opts: { onlyActive?: boolean } = {}) {
  assertCan(ctx, "tasks:read");
  await ensureSeedPackages(ctx.organizationId);
  return db.workflowPackage.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, ...(opts.onlyActive ? { active: true } : {}) },
    orderBy: { createdAt: "asc" },
    include: { steps: { orderBy: { position: "asc" } } },
  });
}

async function pkg(ctx: TenantContext, id: string) {
  const p = await db.workflowPackage.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, include: { steps: { orderBy: { position: "asc" } } } });
  if (!p) throw new NotFoundError("Pacote não encontrado.");
  return p;
}

export async function savePackage(ctx: TenantContext, id: string | null, raw: PackageInput) {
  assertCan(ctx, "organization:manage");
  const v = packageSchema.parse(raw);
  for (const s of v.steps) if (s.assigneeId) await assertActiveMember(ctx, s.assigneeId);
  const data = v.steps.map((s, i) => ({ organizationId: ctx.organizationId, position: i, title: s.title, description: s.description || null, dueDays: s.dueDays, priority: s.priority, countType: s.countType, relativeTo: s.relativeTo, waitForPrevious: s.waitForPrevious, assigneeMode: s.assigneeId ? "FIXED" : s.assigneeMode, assigneeId: s.assigneeId || null, ask: s.ask || null }));
  let savedId = id;
  await db.$transaction(async (tx) => {
    if (id) {
      await pkg(ctx, id);
      await tx.workflowPackage.update({ where: { id }, data: { name: v.name, description: v.description || null, active: v.active } });
      await tx.workflowPackageStep.deleteMany({ where: { packageId: id } });
      await tx.workflowPackageStep.createMany({ data: data.map((d) => ({ ...d, packageId: id })) });
    } else {
      const c = await tx.workflowPackage.create({ data: { organizationId: ctx.organizationId, name: v.name, description: v.description || null, active: v.active, createdById: ctx.userId, steps: { create: data } } });
      savedId = c.id;
    }
  });
  await audit({ action: id ? "workflow_package.update" : "workflow_package.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "workflow_package", resourceId: savedId ?? undefined, meta: ctx.meta });
  return savedId!;
}

export async function deletePackage(ctx: TenantContext, id: string) {
  assertCan(ctx, "organization:manage");
  await pkg(ctx, id);
  await db.workflowPackage.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await audit({ action: "workflow_package.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "workflow_package", resourceId: id, meta: ctx.meta });
}

export async function runPackage(ctx: TenantContext, packageId: string, raw: RunInput) {
  assertCan(ctx, "tasks:write");
  const v = runSchema.parse(raw);
  const p = await pkg(ctx, packageId);
  if (!p.active) throw new ConflictError("Este pacote está desativado.");
  if (!v.caseId && !v.clientId) throw new ValidationError("Escolha o processo ou o cliente.", { caseId: ["Informe o processo ou o cliente."] });
  const kase = v.caseId ? await assertCaseVisible(ctx, v.caseId) : null;
  for (const s of p.steps) if (s.ask && !(v.answers[s.id] ?? "").trim()) throw new ValidationError(`Responda: ${s.ask}`, { [s.id]: [`Responda: ${s.ask}`] });
  if (v.clientId) await getClient(ctx,v.clientId);
  const responsible=v.caseId?await db.caseMember.findFirst({where:{organizationId:ctx.organizationId,caseId:v.caseId,role:"RESPONSIBLE"},select:{userId:true}}):null;
  const assignees=p.steps.map(s=>s.assigneeId|| (s.assigneeMode==="CASE_RESPONSIBLE"?responsible?.userId:ctx.userId)||ctx.userId);
  for(const userId of new Set(assignees)) {
    await assertActiveMember(ctx,userId);
    if(kase?.confidential){
      const member=await db.caseMember.findFirst({where:{organizationId:ctx.organizationId,caseId:kase.id,userId},select:{id:true}});
      const admin=await db.membership.findFirst({where:{organizationId:ctx.organizationId,userId,status:"ACTIVE",role:{permissions:{has:"organization:manage"}}},select:{id:true}});
      if(!member&&!admin)throw new ValidationError("O responsável precisa ter acesso ao processo sigiloso antes de executar o pacote.");
    }
  }
  const targetBoard=v.boardId?await db.kanbanBoard.findFirst({where:{id:v.boardId,organizationId:ctx.organizationId,archivedAt:null},include:{columns:{orderBy:{position:"asc"},take:1}}}):null;
  if(v.boardId&&!targetBoard?.columns[0])throw new ValidationError("Quadro indisponível.");
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:${packageId}:${v.caseId||v.clientId}`},0))`;
    if(!v.force&&await tx.workflowPackageRun.findFirst({where:{organizationId:ctx.organizationId,packageId,caseId:v.caseId||null,clientId:v.clientId||null}}))throw new ConflictError("Este pacote já foi executado neste vínculo. Confirme para executar de novo.");
    const unchanged=await tx.workflowPackage.findFirst({where:{id:p.id,organizationId:ctx.organizationId,updatedAt:p.updatedAt,active:true,deletedAt:null}});
    if(!unchanged)throw new ConflictError("O pacote mudou. Recarregue antes de executar.");
    const run=await tx.workflowPackageRun.create({data:{organizationId:ctx.organizationId,packageId,caseId:v.caseId||null,clientId:v.clientId||null,baseDate:new Date(`${v.baseDate}T00:00:00Z`),createdById:ctx.userId}});
    let previousId:string|null=null,previousDue:string|null=null;const dates:string[]=[];
    for(let index=0;index<p.steps.length;index++){
      const step=p.steps[index]!;
      const wait:boolean=!!previousId&&(step.waitForPrevious||step.relativeTo==="PREVIOUS_DONE");
      const base:string|null=step.relativeTo==="PREVIOUS_DUE"?previousDue:v.baseDate;
      if(step.relativeTo==="PREVIOUS_DUE"&&!base)throw new ValidationError("Uma etapa depende de vencimento ainda indefinido. Use a conclusão anterior como referência.");
      const date:string|null=step.relativeTo==="PREVIOUS_DONE"?null:activityOffset(base??v.baseDate,step.dueDays,step.countType,v.nonWorkingDates);
      const answer=(v.answers[step.id]??"").trim();
      const task: {id:string}=await tx.task.create({data:{organizationId:ctx.organizationId,title:step.title,description:[step.description??"",answer?`${step.ask}: ${answer}`:"",`Pacote: ${p.name}`].filter(Boolean).join("\n\n"),status:wait?"WAITING":"TODO",priority:step.priority,dueDate:date?new Date(`${date}T00:00:00Z`):null,assigneeId:assignees[index],caseId:v.caseId||null,clientId:v.clientId||null,createdById:ctx.userId}});
      await recordTaskEvent(tx,ctx,task.id,"created",`Criada pelo pacote ${p.name}`);
      if(assignees[index]!==ctx.userId)await notify({organizationId:ctx.organizationId,userId:assignees[index]!,kind:"task.assigned",title:`Nova tarefa para você: ${step.title}`,link:`/tarefas/${task.id}`,dedupeKey:`task-assigned:${task.id}:${assignees[index]}`},tx);
      if(wait&&previousId)await tx.taskDependency.create({data:{organizationId:ctx.organizationId,taskId:task.id,predecessorId:previousId,onCompletion:step.relativeTo==="PREVIOUS_DONE",offsetDays:step.dueDays,countType:step.countType,nonWorkingDates:v.nonWorkingDates}});
      previousId=task.id;previousDue=date;if(date)dates.push(date);
    }
    let cardId:string|null=null;
    if(targetBoard?.columns[0]){
      const col=targetBoard.columns[0];
      const card=await tx.kanbanCard.create({data:{organizationId:ctx.organizationId,boardId:targetBoard.id,columnId:col.id,title:`${p.name}${kase?` — ${kase.title}`:""}`.slice(0,200),caseId:v.caseId||null,clientId:v.clientId||null,dueDate:dates.length?new Date(`${dates.sort().at(-1)}T00:00:00Z`):null,closedAt:col.isDone?new Date():null,runId:run.id,createdById:ctx.userId}});
      cardId=card.id;
      await tx.kanbanCardEvent.create({data:{organizationId:ctx.organizationId,cardId,userId:ctx.userId,kind:"created",text:"Resumo de execução do pacote"}});
    }
    await tx.workflowPackageRun.update({where:{id:run.id},data:{taskCount:p.steps.length,cardId}});
    if(v.caseId)await logCaseEvent(tx,ctx,v.caseId,{kind:"WORKFLOW_PACKAGE",title:`Pacote executado: ${p.name}`,description:`${p.steps.length} tarefas criadas.`});
    await audit({action:"workflow_package.run",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"workflow_package_run",resourceId:run.id,metadata:{packageId,tasks:p.steps.length},meta:ctx.meta},tx);
    return {runId:run.id,created:p.steps.length,failed:[] as string[],cardId};
  },{timeout:30000});
}

export async function listRunsForCase(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "tasks:read");
  await assertCaseVisible(ctx, caseId);
  const runs = await db.workflowPackageRun.findMany({ where: { organizationId: ctx.organizationId, caseId }, orderBy: { createdAt: "desc" }, take: 20, include: { package: { select: { name: true } } } });
  return runs.map((r) => ({ id: r.id, name: r.package.name, taskCount: r.taskCount, createdAt: r.createdAt }));
}
