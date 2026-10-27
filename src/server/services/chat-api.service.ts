import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { ConflictError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { workspaceConversation } from "./chat-workbench.service";
import { sendMessage } from "./whatsapp.service";
import { audit } from "./audit.service";

const sendSchema=z.object({text:z.string().trim().min(1).max(4096),approvedByHuman:z.literal(true)});
type Result={id:string;status:"SENT"|"FAILED";error:string|null};
/** An uncertain attempt is never repeated automatically. A reused key must have the identical request. */
export async function sendApiChatMessage(ctx:TenantContext,id:string,key:string,input:unknown):Promise<Result> {
  assertCan(ctx,"whatsapp:write");await workspaceConversation(ctx,id);
  const d=sendSchema.parse(input);z.string().min(12).max(120).regex(/^[A-Za-z0-9_-]+$/).parse(key);
  const hash=createHash("sha256").update(JSON.stringify({id,...d})).digest("hex");
  const claimed=await db.$executeRaw`INSERT INTO chat_api_sends(organization_id,idempotency_key,request_hash,conversation_id,state) VALUES(${ctx.organizationId}::uuid,${key},${hash},${id}::uuid,'SENDING') ON CONFLICT DO NOTHING`;
  if(!claimed) {
    const rows=await db.$queryRaw<{request_hash:string;state:string;result:Result|null}[]>`SELECT request_hash,state,result FROM chat_api_sends WHERE organization_id=${ctx.organizationId}::uuid AND idempotency_key=${key}`;
    const r=rows[0];if(r?.request_hash!==hash)throw new ConflictError("Chave de idempotência já usada com outro conteúdo.");
    if(r.state==="DONE"&&r.result)return r.result;
    throw new ConflictError("Envio em andamento ou resultado incerto. Confira a conversa antes de uma nova tentativa.");
  }
  try {
    await audit({action:"chat.api.send",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"whatsapp_conversation",resourceId:id,metadata:{approvedByHuman:true},meta:ctx.meta});
    const result=await sendMessage(ctx,id,d.text);
    await db.$executeRaw`UPDATE chat_api_sends SET state='DONE',result=${JSON.stringify(result)}::jsonb WHERE organization_id=${ctx.organizationId}::uuid AND idempotency_key=${key}`;
    return result;
  } catch(e) {
    await db.$executeRaw`UPDATE chat_api_sends SET state='UNKNOWN' WHERE organization_id=${ctx.organizationId}::uuid AND idempotency_key=${key}`;
    throw e;
  }
}
