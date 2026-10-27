import { jsonOk,v1Route } from "@/lib/api/v1";
import { sendEmailReply } from "@/server/services/chat-email.service";
export const dynamic="force-dynamic";
export const POST=v1Route<{id:string}>("chat:send",async({principal,params,req,body})=>jsonOk({data:await sendEmailReply(principal.ctx,params.id,{...await body(),key:req.headers.get("idempotency-key")??""})}));
