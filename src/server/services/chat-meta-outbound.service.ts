import { db } from "@/lib/db/client";
import { ConflictError } from "@/lib/permissions/check";
import { metaTemplateSchema } from "@/lib/whatsapp/interactive";
import { createMessageTemplate } from "@/lib/whatsapp/client";
import { assertCan,type TenantContext } from "@/server/context";
import { loadAuth } from "./whatsapp-auth";
import { audit } from "./audit.service";

export async function submitMetaTemplate(ctx:TenantContext,raw:unknown) {
 assertCan(ctx,"whatsapp:manage");const d=metaTemplateSchema.parse(raw);
 const {account,auth,cfg}=await loadAuth(ctx.organizationId,d.accountId);
 if(!account.wabaId)throw new ConflictError("Cadastre o WABA ID do número antes de enviar um modelo para aprovação.");
 const result=await createMessageTemplate(cfg,auth.token,account.wabaId,d);
 // A submission is never interpreted as approval. Synchronization remains authoritative.
 await db.whatsappTemplate.upsert({where:{organizationId_name_language:{organizationId:ctx.organizationId,name:d.name,language:d.language}},create:{organizationId:ctx.organizationId,name:d.name,language:d.language,category:d.category,status:"PENDING",body:d.body,variableCount:0},update:{category:d.category,status:"PENDING",body:d.body,variableCount:0,syncedAt:new Date()}});
 await audit({action:"chat.template.submit",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"whatsapp_account",resourceId:d.accountId,metadata:{name:d.name},meta:ctx.meta});
 return {id:result.id,status:"PENDING"};
}
