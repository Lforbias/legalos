import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { db } from "@/lib/db/client";
import { __setChatEmailDriverForTests } from "@/lib/mail/chat-email-transport";
import type { EmailEnvelope } from "@/lib/whatsapp/email-schema";
import { saveEmailAccount,setEmailEnabled,syncOfficeEmail,emailInbox,emailThread,sendEmailReply,updateEmailConversation,emailAttachment,emailAccountStatus } from "@/server/services/chat-email.service";
import { startEnrollment,confirmEnrollment } from "@/server/services/mfa.service";
import { totpCode,totpStep } from "@/lib/security/totp";
import { makeOrgWithOwner,addMember,META } from "./helpers";
import { getUsage } from "@/server/services/plan.service";
const saved={...process.env};
describe("Chat email — encrypted credentials, intake, reply and isolation",()=>{
 let a:Awaited<ReturnType<typeof makeOrgWithOwner>>,b:typeof a;
 let incoming:EmailEnvelope[]=[],sent=0,fail=false,verified=0;
 const message=(over:Partial<EmailEnvelope>={}):EmailEnvelope=>({uid:1,providerId:"<source-1@example.test>",inReplyTo:null,references:[],from:"cliente@example.test",subject:"Documentos do atendimento",text:"Mensagem de teste, sem HTML ativo.",at:new Date(),attachments:[{filename:"teste.txt",mime:"text/plain",content:Buffer.from("anexo de teste")}],...over});
 beforeAll(async()=>{
  process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,9).toString("base64");
  a=await makeOrgWithOwner("email-a");b=await makeOrgWithOwner("email-b");
  const m=await startEnrollment(a.owner.id,a.owner.email);await confirmEnrollment(a.owner.id,totpCode(m.secret,totpStep()),META);
  __setChatEmailDriverForTests({verify:async()=>{verified++;},receive:async()=>({validity:"42",messages:incoming,lastUid:incoming.at(-1)?.uid??0,skipped:0}),send:async()=>{sent++;if(fail)throw new Error("SMTP uncertainty");}});
 });
 afterAll(async()=>{if(a)await db.$executeRaw`UPDATE chat_email_accounts SET enabled=false WHERE organization_id=${a.org.id}::uuid`;__setChatEmailDriverForTests(undefined);process.env={...saved};});
 it("requires management and MFA, encrypts credentials, starts off and verifies before activation",async()=>{
  const config={address:"escritorio@example.test",imapHost:"imap.example.test",smtpHost:"smtp.example.test",smtpPort:465,username:"escritorio@example.test",password:"secret-application-password"};
  await expect(saveEmailAccount(b.ctx,config)).rejects.toThrow("duas etapas");
  await saveEmailAccount(a.ctx,config);
  const raw=await db.$queryRaw<{config_enc:string;enabled:boolean}[]>`SELECT config_enc,enabled FROM chat_email_accounts WHERE organization_id=${a.org.id}::uuid`;
  expect(raw[0]?.enabled).toBe(false);expect(raw[0]?.config_enc).not.toContain(config.password);
  expect(JSON.stringify(await emailAccountStatus(a.ctx))).not.toContain(config.password);
  await setEmailEnabled(a.ctx,true);expect(verified).toBe(1);
 });
 it("stores messages and attachments once without sending and isolates inbox and attachment access",async()=>{
  incoming=[message()];await syncOfficeEmail(a.ctx);await syncOfficeEmail(a.ctx);
  const inbox=await emailInbox(a.ctx);expect(inbox).toHaveLength(1);expect(await emailInbox(b.ctx)).toHaveLength(0);
  const thread=await emailThread(a.ctx,inbox[0]!.id);expect(thread.messages).toHaveLength(1);expect(sent).toBe(0);
  expect(thread.messages[0]!.attachments[0]).toMatchObject({filename:"teste.txt"});expect(JSON.stringify(thread)).not.toContain('"key":');
  expect((await getUsage(a.org.id)).storageBytes).toBeGreaterThanOrEqual(Buffer.byteLength("anexo de teste"));
  await expect(emailThread(b.ctx,inbox[0]!.id)).rejects.toThrow();
  await expect(emailAttachment(b.ctx,thread.messages[0]!.id,0)).rejects.toThrow();
 });
 it("replies to the confirmed sender with an idempotent attempt, preserving the thread on incoming references",async()=>{
  const c=(await emailInbox(a.ctx))[0]!;const key=randomUUID();
  const result=await sendEmailReply(a.ctx,c.id,{text:"Recebemos os documentos.",key,approvedByHuman:true});
  await sendEmailReply(a.ctx,c.id,{text:"Recebemos os documentos.",key,approvedByHuman:true});expect(sent).toBe(1);
  const out=(await db.$queryRaw<{provider_id:string}[]>`SELECT provider_id FROM chat_email_messages WHERE id=${result.id}::uuid`)[0]!;
  incoming=[message({uid:2,providerId:"<source-2@example.test>",inReplyTo:out.provider_id,attachments:[]})];await syncOfficeEmail(a.ctx);
  expect(await emailInbox(a.ctx)).toHaveLength(1);expect((await emailThread(a.ctx,c.id)).messages).toHaveLength(3);
 });
 it("blocks sends, retains uncertain results without retry, validates ownership and active team assignments",async()=>{
  const c=(await emailInbox(a.ctx))[0]!;
  await updateEmailConversation(a.ctx,c.id,{status:"CLOSED",blocked:true,queueId:null,assignedToId:a.owner.id});
  await expect(sendEmailReply(a.ctx,c.id,{text:"Não deve sair",key:randomUUID(),approvedByHuman:true})).rejects.toThrow("bloqueado");
  await updateEmailConversation(a.ctx,c.id,{status:"OPEN",blocked:false,queueId:null,assignedToId:a.owner.id});
  fail=true;const key=randomUUID();await expect(sendEmailReply(a.ctx,c.id,{text:"Resultado incerto",key,approvedByHuman:true})).rejects.toThrow("confirmar");
  const after=sent;await expect(sendEmailReply(a.ctx,c.id,{text:"Resultado incerto",key,approvedByHuman:true})).rejects.toThrow("incerto");expect(sent).toBe(after);fail=false;
  await expect(updateEmailConversation(a.ctx,c.id,{status:"OPEN",blocked:false,queueId:null,assignedToId:b.owner.id})).rejects.toThrow("indisponível");
  const member=await addMember(a.org.id,"ASSISTANT","email-settings-denied");await expect(emailAccountStatus(member.ctx)).rejects.toThrow();
 });
});
