import { jsonOk, v1Route } from "@/lib/api/v1";
import { sendApiChatMessage } from "@/server/services/chat-api.service";
export const dynamic="force-dynamic";
export const POST=v1Route<{id:string}>("chat:send",async({principal,params,req,body})=>jsonOk({data:await sendApiChatMessage(principal.ctx,params.id,req.headers.get("idempotency-key")??"",await body())}));
