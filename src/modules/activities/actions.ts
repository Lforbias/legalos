"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { setActivityStatus, type ActivityKind } from "@/server/services/activity.service";
export async function activityStatusAction(kind: ActivityKind, id: string, status: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setActivityStatus(ctx, kind, id, status);
    for (const path of ["/agenda", "/gestao", "/tarefas", "/prazos", "/processos", "/"]) revalidatePath(path);
    revalidatePath(kind === "TASK" ? `/tarefas/${id}` : kind === "EVENT" ? `/agenda/${id}` : `/prazos/${id}`);
    return undefined;
  });
}

export async function checklistCreateAction(kind: ActivityKind,id:string,input:unknown) {
  return runAction(async()=>{ const {ctx}=await requireTenant(); const {createActivityChecklist}=await import("@/server/services/activity-details.service"); await createActivityChecklist(ctx,kind,id,input); revalidatePath("/tarefas"); revalidatePath("/agenda"); revalidatePath("/prazos"); return undefined; });
}
export async function checklistItemAction(id:string,done:boolean) {
  return runAction(async()=>{const {ctx}=await requireTenant();const {setChecklistItem}=await import("@/server/services/activity-details.service");await setChecklistItem(ctx,id,done);revalidatePath("/tarefas");revalidatePath("/agenda");revalidatePath("/prazos");return undefined;});
}
export async function collaboratorAction(kind:ActivityKind,id:string,userId:string,add:boolean) {
  return runAction(async()=>{const {ctx}=await requireTenant();const {addActivityCollaborator,removeActivityCollaborator}=await import("@/server/services/activity-details.service"); if(add) await addActivityCollaborator(ctx,kind,id,userId);else await removeActivityCollaborator(ctx,kind,id,userId);revalidatePath("/tarefas");revalidatePath("/agenda");revalidatePath("/prazos");return undefined;});
}
export async function repeatActivityAction(kind:ActivityKind,id:string,rule:unknown){
 return runAction(async()=>{const {ctx}=await requireTenant();const {repeatActivity}=await import("@/server/services/activity-series.service");const {recurrenceSchema}=await import("@/lib/activities/recurrence");const result=await repeatActivity(ctx,kind,id,recurrenceSchema.parse(rule));for(const path of ["/agenda","/tarefas","/gestao","/processos"])revalidatePath(path);return result;});
}
export async function followingActivitiesAction(kind:ActivityKind,id:string,input:unknown){
 return runAction(async()=>{const {ctx}=await requireTenant();const {updateFollowingActivities}=await import("@/server/services/activity-series.service");const result=await updateFollowingActivities(ctx,kind,id,input);for(const path of ["/agenda","/tarefas","/gestao","/processos"])revalidatePath(path);return result;});
}
