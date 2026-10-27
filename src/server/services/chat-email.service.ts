import { createHash,randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { encryptSecret,decryptSecret,mfaKey } from "@/lib/security/totp";
import { chatEmailDriver } from "@/lib/mail/chat-email-transport";
import { emailAccountSchema,type EmailAccountConfig,type EmailEnvelope } from "@/lib/whatsapp/email-schema";
import { ConflictError,NotFoundError } from "@/lib/permissions/check";
import { assertCan,type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { emitChatEvent } from "./chat-workbench.service";
import { assertStorageAvailable } from "./plan.service";
import { putObject,deleteObject } from "@/lib/storage/local-storage";
import { aiRun,SAFETY } from "./ai-tools.service";
import { maskSensitive } from "@/lib/ai/mask";
import { chatAssistEnabled,listChatResources } from "./chat-workbench.service";
import { RateLimiter } from "@/lib/security/rate-limit";
const aiLimit=new RateLimiter(6,60_000);
export type EmailAccountRow={id:string;organization_id:string;address:string;config_enc:string;enabled:boolean;queue_id:string|null;uid_validity:string|null;last_uid:bigint;last_checked_at:Date|null;last_error:string|null};
export type EmailConversation={id:string;contact_email:string;subject:string;status:string;blocked:boolean;queue_id:string|null;assigned_to_id:string|null;updated_at:Date;created_at:Date};
type Attachment={key:string;filename:string;mime:string;size:number};
export type EmailMessage={id:string;provider_id:string;direction:string;body:string;status:string;created_at:Date;attachments:Attachment[]};
const key=()=>{const k=mfaKey();if(!k)throw new ConflictError("Cofre de credenciais indisponível.");return k;};
async function accountFor(org:string) {return (await db.$queryRaw<EmailAccountRow[]>`SELECT * FROM chat_email_accounts WHERE organization_id=${org}::uuid`)[0]??null;}
function configFor(a:EmailAccountRow):EmailAccountConfig{return emailAccountSchema.parse(JSON.parse(decryptSecret(a.config_enc,key())));}
async function requireMfa(ctx:TenantContext) {const m=await db.userMfa.findUnique({where:{userId:ctx.userId},select:{enabledAt:true}});if(!m?.enabledAt)throw new ConflictError("Ative a verificação em duas etapas antes de configurar a caixa do escritório.");}
export async function emailAccountStatus(ctx:TenantContext) {
 assertCan(ctx,"whatsapp:manage");const a=await accountFor(ctx.organizationId);if(!a)return null;
 const c=configFor(a);
 return {id:a.id,address:a.address,enabled:a.enabled,imapHost:c.imapHost,smtpHost:c.smtpHost,smtpPort:c.smtpPort,username:c.username,queueId:a.queue_id,lastCheckedAt:a.last_checked_at,lastError:a.last_error};
}
export async function saveEmailAccount(ctx:TenantContext,raw:unknown) {
 assertCan(ctx,"whatsapp:manage");await requireMfa(ctx);
 const current=await accountFor(ctx.organizationId);
 const submitted=z.object({...emailAccountSchema.shape,password:z.string().max(512).optional()}).parse(raw);
 const d=emailAccountSchema.parse({...submitted,password:submitted.password|| (current?configFor(current).password:"")});
 if(d.queueId&&!await db.whatsappQueue.findFirst({where:{id:d.queueId,organizationId:ctx.organizationId,active:true}}))throw new NotFoundError("Fila indisponível.");
 // Changing the mailbox identity requires an explicit migration rather than mixing old threads.
 if(current&&(current.address.toLowerCase()!==d.address.toLowerCase()||configFor(current).imapHost!==d.imapHost))throw new ConflictError("A caixa já tem uma identidade cadastrada. Troca de endereço/servidor exige migração para preservar o histórico.");
 const enc=encryptSecret(JSON.stringify(d),key());
 await db.$executeRaw`INSERT INTO chat_email_accounts(id,organization_id,address,config_enc,queue_id) VALUES(${randomUUID()}::uuid,${ctx.organizationId}::uuid,${d.address.toLowerCase()},${enc},${d.queueId}::uuid) ON CONFLICT(organization_id) DO UPDATE SET config_enc=excluded.config_enc,queue_id=excluded.queue_id,enabled=false,updated_at=now(),last_error=null`;
 await audit({action:"chat.email.configure",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"organization",meta:ctx.meta});
}
export async function setEmailEnabled(ctx:TenantContext,enabled:boolean) {
 assertCan(ctx,"whatsapp:manage");await requireMfa(ctx);z.boolean().parse(enabled);
 const a=await accountFor(ctx.organizationId);if(!a)throw new NotFoundError("Cadastre uma caixa primeiro.");
 if(enabled)try{await chatEmailDriver().verify(configFor(a));}catch{throw new ConflictError("Não foi possível autenticar IMAP e SMTP com TLS. Confira os servidores, a senha de aplicativo e as permissões do provedor.");}
 await db.$executeRaw`UPDATE chat_email_accounts SET enabled=${enabled},updated_at=now(),last_error=null WHERE id=${a.id}::uuid AND organization_id=${ctx.organizationId}::uuid`;
 await audit({action:"chat.email.switch",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"chat_email_account",resourceId:a.id,metadata:{enabled},meta:ctx.meta});
}
export async function syncOfficeEmail(ctx:TenantContext) {
 assertCan(ctx,"whatsapp:manage");const a=await accountFor(ctx.organizationId);if(!a?.enabled)throw new ConflictError("A caixa de e-mail está desligada.");
 return pollEmailAccount(a);
}
async function pollEmailAccount(a:EmailAccountRow) {
 const lease=await db.$executeRaw`UPDATE chat_email_accounts SET poll_until=now()+interval '2 minutes' WHERE id=${a.id}::uuid AND enabled=true AND (poll_until IS NULL OR poll_until<now())`;
 if(!lease)return {received:0,busy:true,skipped:0};
 let received=0;
 try {
  const result=await chatEmailDriver().receive(configFor(a),{validity:a.uid_validity,uid:Number(a.last_uid)});
  for(const message of result.messages)if(await storeInboundEmail(a,message))received++;
  await db.$executeRaw`UPDATE chat_email_accounts SET uid_validity=${result.validity},last_uid=${result.lastUid},last_checked_at=now(),last_error=${result.skipped?`${result.skipped} mensagem(ns) maior(es) que 2 MB não importada(s); consulte o provedor.`:null} WHERE id=${a.id}::uuid`;
  return {received,busy:false,skipped:result.skipped};
 }catch{
  await db.$executeRaw`UPDATE chat_email_accounts SET last_checked_at=now(),last_error='Falha na leitura IMAP. Confira a conexão e a caixa no provedor.' WHERE id=${a.id}::uuid`;
  throw new ConflictError("Falha na leitura do e-mail. Confira a conexão e a caixa no provedor.");
 }finally{await db.$executeRaw`UPDATE chat_email_accounts SET poll_until=null WHERE id=${a.id}::uuid`;}
}
async function storeInboundEmail(a:EmailAccountRow,m:EmailEnvelope) {
 if(!z.email().safeParse(m.from).success||m.from.toLowerCase()===a.address.toLowerCase())return false;
 if((await db.$queryRaw<{id:string}[]>`SELECT id FROM chat_email_messages WHERE account_id=${a.id}::uuid AND provider_id=${m.providerId}`).length)return false;
 const refs=[m.inReplyTo,...m.references].filter((s):s is string=>!!s).slice(-21);
 const matched=refs.length?await db.$queryRaw<{id:string}[]>`SELECT c.id FROM chat_email_messages m JOIN chat_email_conversations c ON c.id=m.conversation_id WHERE m.account_id=${a.id}::uuid AND m.organization_id=${a.organization_id}::uuid AND m.provider_id=ANY(${refs}::text[]) AND c.contact_email=${m.from.toLowerCase()} ORDER BY m.created_at DESC LIMIT 1`:[];
 const conversationId=matched[0]?.id??randomUUID();const messageId=randomUUID();const attachments:Attachment[]=[];
 try {
  await assertStorageAvailable(a.organization_id,m.attachments.slice(0,10).reduce((n,a)=>n+a.content.length,0));
  for(const file of m.attachments.slice(0,10)){
   const storageKey=`${a.organization_id}/${randomUUID()}`;await putObject(storageKey,file.content);
   attachments.push({key:storageKey,filename:file.filename,mime:file.mime,size:file.content.length});
  }
  await db.$transaction(async tx=>{
   if(!matched.length)await tx.$executeRaw`INSERT INTO chat_email_conversations(id,organization_id,account_id,contact_email,subject,queue_id) VALUES(${conversationId}::uuid,${a.organization_id}::uuid,${a.id}::uuid,${m.from.toLowerCase()},${m.subject},${a.queue_id}::uuid)`;
   await tx.$executeRaw`INSERT INTO chat_email_messages(id,organization_id,conversation_id,account_id,provider_id,direction,body,attachments,status,created_at) VALUES(${messageId}::uuid,${a.organization_id}::uuid,${conversationId}::uuid,${a.id}::uuid,${m.providerId},'IN',${m.text},${JSON.stringify(attachments)}::jsonb,'RECEIVED',${m.at})`;
   await tx.$executeRaw`UPDATE chat_email_conversations SET status='OPEN',updated_at=now() WHERE id=${conversationId}::uuid AND organization_id=${a.organization_id}::uuid`;
  });
 }catch(e){for(const file of attachments)await deleteObject(file.key).catch(()=>undefined);throw e;}
 await emitChatEvent(a.organization_id,"chat.message.received",{channel:"EMAIL",conversationId,messageId}).catch(()=>0);
 return true;
}
export async function runEmailInboxes() {
 const accounts=await db.$queryRaw<EmailAccountRow[]>`SELECT * FROM chat_email_accounts WHERE enabled=true AND (last_checked_at IS NULL OR last_checked_at<now()-interval '1 minute') ORDER BY last_checked_at NULLS FIRST LIMIT 10`;
 let received=0,failed=0;for(const a of accounts)try{received+=(await pollEmailAccount(a)).received;}catch{failed++;}
 return {received,failed};
}
export async function emailInbox(ctx:TenantContext) {
 assertCan(ctx,"whatsapp:read");
 return db.$queryRaw<EmailConversation[]>`SELECT id,contact_email,subject,status,blocked,queue_id,assigned_to_id,updated_at,created_at FROM chat_email_conversations WHERE organization_id=${ctx.organizationId}::uuid ORDER BY updated_at DESC LIMIT 200`;
}
export async function emailThread(ctx:TenantContext,id:string) {
 assertCan(ctx,"whatsapp:read");z.uuid().parse(id);
 const c=(await db.$queryRaw<EmailConversation[]>`SELECT id,contact_email,subject,status,blocked,queue_id,assigned_to_id,updated_at,created_at FROM chat_email_conversations WHERE organization_id=${ctx.organizationId}::uuid AND id=${id}::uuid`)[0];
 if(!c)throw new NotFoundError("Atendimento de e-mail não encontrado.");
 const messages=await db.$queryRaw<EmailMessage[]>`SELECT id,provider_id,direction,body,status,attachments,created_at FROM chat_email_messages WHERE organization_id=${ctx.organizationId}::uuid AND conversation_id=${id}::uuid ORDER BY created_at DESC LIMIT 100`;
 // Storage keys are used only by the protected attachment route.
 return {conversation:c,messages:messages.reverse().map(m=>({...m,attachments:m.attachments.map((f,index)=>({filename:f.filename,mime:f.mime,size:f.size,url:`/api/chat/email/attachments/${m.id}/${index}`}))}))};
}
export async function emailAttachment(ctx:TenantContext,id:string,index:number) {
 assertCan(ctx,"whatsapp:read");z.uuid().parse(id);z.number().int().min(0).max(9).parse(index);
 const m=(await db.$queryRaw<{attachments:Attachment[]}[]>`SELECT attachments FROM chat_email_messages WHERE organization_id=${ctx.organizationId}::uuid AND id=${id}::uuid`)[0];
 const f=m?.attachments[index];if(!f)throw new NotFoundError("Anexo não encontrado.");return f;
}
export async function updateEmailConversation(ctx:TenantContext,id:string,raw:unknown) {
 assertCan(ctx,"whatsapp:write");await emailThread(ctx,id);
 const d=z.object({status:z.enum(["OPEN","CLOSED"]),blocked:z.boolean(),assignedToId:z.uuid().nullable(),queueId:z.uuid().nullable()}).parse(raw);
 if(d.assignedToId&&!await db.membership.findFirst({where:{organizationId:ctx.organizationId,userId:d.assignedToId,status:"ACTIVE",user:{disabledAt:null}}}))throw new NotFoundError("Atendente indisponível.");
 if(d.queueId&&!await db.whatsappQueue.findFirst({where:{organizationId:ctx.organizationId,id:d.queueId,active:true}}))throw new NotFoundError("Fila indisponível.");
 await db.$executeRaw`UPDATE chat_email_conversations SET status=${d.status},blocked=${d.blocked},assigned_to_id=${d.assignedToId}::uuid,queue_id=${d.queueId}::uuid,updated_at=now() WHERE organization_id=${ctx.organizationId}::uuid AND id=${id}::uuid`;
 await audit({action:"chat.email.update",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"chat_email_conversation",resourceId:id,meta:ctx.meta});
}
export async function sendEmailReply(ctx:TenantContext,id:string,raw:unknown) {
 assertCan(ctx,"whatsapp:write");const d=z.object({text:z.string().trim().min(1).max(20000),key:z.uuid(),approvedByHuman:z.literal(true)}).parse(raw);
 const {conversation:c}=await emailThread(ctx,id);if(c.blocked)throw new ConflictError("Atendimento bloqueado para envios.");
 const a=await accountFor(ctx.organizationId);if(!a?.enabled)throw new ConflictError("Caixa de e-mail desligada.");
 const hash=createHash("sha256").update(`${id}:${d.text}`).digest("hex");const mid=randomUUID();const providerId=`<${mid}@${a.address.split("@")[1]}>`;
 const inserted=await db.$executeRaw`INSERT INTO chat_email_messages(id,organization_id,conversation_id,account_id,provider_id,direction,body,status,send_key,request_hash,author_id) VALUES(${mid}::uuid,${ctx.organizationId}::uuid,${id}::uuid,${a.id}::uuid,${providerId},'OUT',${d.text},'SENDING',${d.key},${hash},${ctx.userId}::uuid) ON CONFLICT(account_id,send_key) DO NOTHING`;
 if(!inserted){const old=(await db.$queryRaw<{id:string;status:string;request_hash:string}[]>`SELECT id,status,request_hash FROM chat_email_messages WHERE account_id=${a.id}::uuid AND send_key=${d.key}`)[0];if(old?.request_hash!==hash)throw new ConflictError("Esta tentativa já foi usada para outro conteúdo.");if(old.status==="SENT")return {id:old.id,status:"SENT"};throw new ConflictError("Envio em andamento ou incerto. Confira o provedor antes de repetir.");}
 try {
  const last=(await db.$queryRaw<{provider_id:string}[]>`SELECT provider_id FROM chat_email_messages WHERE organization_id=${ctx.organizationId}::uuid AND conversation_id=${id}::uuid AND direction='IN' ORDER BY created_at DESC LIMIT 1`)[0];
  await chatEmailDriver().send(configFor(a),{to:c.contact_email,subject:/^re:/i.test(c.subject)?c.subject:`Re: ${c.subject}`,text:d.text,messageId:providerId,inReplyTo:last?.provider_id,references:last?[last.provider_id]:[]});
  await db.$executeRaw`UPDATE chat_email_messages SET status='SENT' WHERE id=${mid}::uuid`;
  await db.$executeRaw`UPDATE chat_email_conversations SET updated_at=now() WHERE id=${id}::uuid`;
 }catch{
  await db.$executeRaw`UPDATE chat_email_messages SET status='UNKNOWN' WHERE id=${mid}::uuid`;
  throw new ConflictError("Não foi possível confirmar o envio. Confira a caixa do provedor antes de tentar novamente.");
 }
 await audit({action:"chat.email.send",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"chat_email_conversation",resourceId:id,meta:ctx.meta});
 await emitChatEvent(ctx.organizationId,"chat.message.sent",{channel:"EMAIL",conversationId:id,messageId:mid,status:"SENT"}).catch(()=>0);
 return {id:mid,status:"SENT"};
}

export async function assistEmailReply(ctx:TenantContext,id:string,raw:unknown) {
 assertCan(ctx,"ai:use");const thread=await emailThread(ctx,id);
 const input=z.object({mode:z.enum(["reply","rewrite","translate"]),text:z.string().max(20000).default(""),language:z.string().trim().min(2).max(40).default("Português")}).parse(raw);
 if(!await chatAssistEnabled(ctx))throw new ConflictError("O copiloto do Chat está desligado.");
 if(!aiLimit.check(`${ctx.organizationId}:${ctx.userId}`))throw new ConflictError("Limite de seis sugestões por minuto. Aguarde.");
 if(input.mode!=="reply"&&!input.text.trim())throw new ConflictError("Escreva o texto para reescrever ou traduzir.");
 const knowledge=(await listChatResources(ctx)).filter(r=>r.kind==="KNOWLEDGE").slice(0,20);
 const system=`${SAFETY}\nNunca envie mensagens. ${input.mode==="translate"?`Traduza apenas o texto para ${input.language}.`:input.mode==="rewrite"?"Reescreva o texto no tom profissional do escritório, sem adicionar fatos ou promessas.":"Sugira uma resposta curta ao e-mail recebido com base no histórico e nas orientações aprovadas. Não invente dados do processo nem promessas. Peça esclarecimento quando faltar informação."}`;
 const context=maskSensitive(JSON.stringify({subject:thread.conversation.subject,messages:thread.messages.slice(-20).map(m=>({direction:m.direction,text:m.body.slice(0,2000)})),knowledge:knowledge.map(k=>({title:k.name,body:String(k.payload.body).slice(0,2000)})),text:input.text})).slice(0,40000);
 const r=await aiRun(ctx,`email_${input.mode}`,null,system,context,1200);
 await audit({action:"chat.email.ai",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"chat_email_conversation",resourceId:id,metadata:{mode:input.mode},meta:ctx.meta});
 return {text:r.text,reviewRequired:true};
}
