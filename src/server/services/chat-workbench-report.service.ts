import { db } from "@/lib/db/client";
import { assertCan,can,type TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";
import { ValidationError } from "@/lib/permissions/check";
export async function workbenchReport(ctx:TenantContext,range:{from:Date;to:Date}) {
 assertCan(ctx,"whatsapp:manage");
 if(!(range.from<range.to)||range.to.getTime()-range.from.getTime()>366*86400000)throw new ValidationError("Período inválido (máximo de um ano).");
 const org=ctx.organizationId;
 const [receipts,automations,bot]=await Promise.all([
  db.$queryRaw<{status:string;total:number}[]>`SELECT coalesce(m.status,'SEM_RECIBO_VINCULADO') status,count(*)::int total FROM whatsapp_campaign_recipients r JOIN whatsapp_campaigns c ON c.id=r.campaign_id LEFT JOIN whatsapp_messages m ON m.id=r.message_id AND m.organization_id=r.organization_id WHERE r.organization_id=${org}::uuid AND c.created_at>=${range.from} AND c.created_at<${range.to} GROUP BY coalesce(m.status,'SEM_RECIBO_VINCULADO')`,
  db.whatsappAutomationRun.groupBy({by:["status"],where:{organizationId:org,createdAt:{gte:range.from,lt:range.to}},_count:true}),
  db.whatsappBotSession.groupBy({by:["state"],where:{organizationId:org,startedAt:{gte:range.from,lt:range.to}},_count:true}),
 ]);
 let funnel:{stage:string;total:number}[]|null=null;
 if(can(ctx,"crm:read")) {
  const leads=await db.lead.findMany({where:{organizationId:org,deletedAt:null,whatsappConversations:{some:{createdAt:{gte:range.from,lt:range.to},OR:[{caseId:null},{case:{AND:[{deletedAt:null},caseVisibility(ctx)]}}]}}},select:{stage:true},take:10001});
  const counts=new Map<string,number>();for(const l of leads.slice(0,10000))counts.set(l.stage,(counts.get(l.stage)??0)+1);
  funnel=[...counts].map(([stage,total])=>({stage,total}));
  return {receipts,automations:automations.map(r=>({status:r.status,total:r._count})),bot:bot.map(r=>({state:r.state,total:r._count})),funnel,truncated:leads.length>10000};
 }
 return {receipts,automations:automations.map(r=>({status:r.status,total:r._count})),bot:bot.map(r=>({state:r.state,total:r._count})),funnel,truncated:false};
}
