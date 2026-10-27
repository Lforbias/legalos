import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { db } from "@/lib/db/client";
import { __setAiProviderForTests } from "@/lib/ai/provider";
import { sealBytes } from "@/lib/security/pfx";
import { makeOrgWithOwner,addMember } from "./helpers";
import { startFakeWhatsapp,WA_TOKEN } from "./fake-whatsapp";
import { applyChatMacro,assistChat,chatContactDetails,chatPresence,listChatResources,recordChatContactEvent,saveChatResource,setChatAssistEnabled,setChatBlocked,workspaceConversation } from "@/server/services/chat-workbench.service";
import { sendApiChatMessage } from "@/server/services/chat-api.service";
import { sendMessage,systemSendText,systemSendInteractive } from "@/server/services/whatsapp.service";
import { applyStatusUpdate,ingestMessage } from "@/server/services/whatsapp-ingest.service";
import { workbenchReport } from "@/server/services/chat-workbench-report.service";
import { submitMetaTemplate } from "@/server/services/chat-meta-outbound.service";
import { createCampaign,campaignReport,campaignClientOptions } from "@/server/services/chat-campaigns.service";
const fake=startFakeWhatsapp(),saved={...process.env};
describe("Chat workbench — tenant boundaries, review and delivery",()=>{
 let a:Awaited<ReturnType<typeof makeOrgWithOwner>>,b:typeof a,accountId:string,id:string;
 beforeAll(async()=>{
  a=await makeOrgWithOwner("chat-workbench-a");b=await makeOrgWithOwner("chat-workbench-b");
  process.env.CERT_ENCRYPTION_KEY=Buffer.alloc(32,7).toString("base64");
  process.env.WHATSAPP_API_URL=await fake.start();
  const acc=await db.whatsappAccount.create({data:{organizationId:a.org.id,label:"Número teste",provider:"META",phoneNumberId:"998877",wabaId:"998866",tokenEnc:sealBytes(Buffer.from(WA_TOKEN),Buffer.alloc(32,7)),enabled:true}});accountId=acc.id;
  const c=await db.whatsappConversation.create({data:{organizationId:a.org.id,accountId,waId:"5571999991111",lastInboundAt:new Date()}});id=c.id;
 });
 afterAll(async()=>{__setAiProviderForTests(undefined);await fake.stop();process.env={...saved};});
 it("isolates shared resources, checks management and updates only the same office",async()=>{
  await saveChatResource(a.ctx,{kind:"KNOWLEDGE",name:"Atendimento inicial",payload:{body:"Confirme com a equipe os documentos necessários para cada caso."}});
  await saveChatResource(a.ctx,{kind:"VIEW",name:"Minhas",payload:{f:"mine"}});
  expect(await listChatResources(b.ctx)).toHaveLength(0);
  await expect(workspaceConversation(b.ctx,id)).rejects.toThrow();
  const member=await addMember(a.org.id,"ASSISTANT","knowledge-denied");
  await expect(saveChatResource(member.ctx,{kind:"KNOWLEDGE",name:"Sem permissão",payload:{body:"Uma orientação válida."}})).rejects.toThrow();
 });
 it("applies internal macros atomically, preserves existing labels and never sends",async()=>{
  const l=await db.whatsappLabel.create({data:{organizationId:a.org.id,name:"Triagem",color:"#2563eb"}});
  await saveChatResource(a.ctx,{kind:"MACRO",name:"Preparar retorno",payload:{note:"Conferir documentos",draft:"Vamos conferir os documentos.",labelIds:[l.id],status:"WAITING"}});
  const macro=(await listChatResources(a.ctx)).find(r=>r.name==="Preparar retorno")!;
  expect(await applyChatMacro(a.ctx,id,macro.id)).toEqual({draft:"Vamos conferir os documentos.",sent:false});
  expect((await db.whatsappConversation.findUniqueOrThrow({where:{id}})).serviceStatus).toBe("WAITING");
  expect(await db.whatsappMessage.count({where:{conversationId:id,direction:"OUT"}})).toBe(0);
  await saveChatResource(a.ctx,{kind:"MACRO",name:"Inválida",payload:{note:"Não deve aparecer",labelIds:[randomUUID()],status:"CLOSED"}});
  const bad=(await listChatResources(a.ctx)).find(r=>r.name==="Inválida")!;
  await expect(applyChatMacro(a.ctx,id,bad.id)).rejects.toThrow();
  expect((await db.whatsappConversation.findUniqueOrThrow({where:{id}})).serviceStatus).toBe("WAITING");
 });
 it("shows another active colleague and ignores expired presence",async()=>{
  const colleague=await addMember(a.org.id,"ASSISTANT","presence");
  await chatPresence(colleague.ctx,id,true);
  expect((await chatPresence(a.ctx,id,false))[0]).toMatchObject({typing:true});
  await db.$executeRaw`UPDATE chat_presence SET touched_at=now()-interval '1 minute' WHERE conversation_id=${id}::uuid`;
  expect(await chatPresence(a.ctx,id,false)).toHaveLength(0);
 });
 it("requires AI switch, masks identifiers, uses approved Chat knowledge and keeps suggestions unsent",async()=>{
  await expect(assistChat(a.ctx,{conversationId:id,mode:"reply"})).rejects.toThrow("desligado");
  await setChatAssistEnabled(a.ctx,true);await db.organization.update({where:{id:a.org.id},data:{aiEnabled:true}});
  await db.whatsappMessage.create({data:{organizationId:a.org.id,conversationId:id,direction:"IN",type:"text",status:"RECEIVED",body:"Meu e-mail é teste@cliente.test e meu CPF é 123.456.789-09"}});
  let sent="";
  __setAiProviderForTests({name:"fake",model:"test",complete:async input=>{sent=JSON.stringify(input);return {text:"Podemos conferir os documentos.",model:"test",inputTokens:100,outputTokens:10};}});
  const suggestion=await assistChat(a.ctx,{conversationId:id,mode:"reply"});
  expect(suggestion.reviewRequired).toBe(true);expect(suggestion.sources).toHaveLength(1);
  expect(sent).toContain("documentos necessários");expect(sent).not.toContain("teste@cliente.test");expect(sent).not.toContain("123.456.789-09");
  expect(await db.whatsappMessage.count({where:{conversationId:id,direction:"OUT"}})).toBe(0);
 });
 it("blocks manual, automatic and interactive sends but records the incoming message without replying",async()=>{
  await setChatBlocked(a.ctx,id,true,"Spam confirmado pela equipe");const before=fake.requests.length;
  await expect(sendMessage(a.ctx,id,"Teste")).rejects.toThrow("bloqueado");
  await expect(systemSendText(a.org.id,id,"Teste")).rejects.toThrow();
  await expect(systemSendInteractive(a.org.id,id,{body:"Teste",options:[{id:"1",title:"Opção"}]})).rejects.toThrow();
  const account=await db.whatsappAccount.findUniqueOrThrow({where:{id:accountId}});
  await ingestMessage(account,{waMessageId:`blocked-${randomUUID()}`,waId:"5571999991111",contactName:null,type:"text",text:"Recebida",timestamp:new Date(),fromMe:false,media:null});
  expect(fake.requests.length).toBe(before);
  expect((await chatContactDetails(a.ctx,id)).blocked).toBe(true);
  await setChatBlocked(a.ctx,id,false,"Revisão do bloqueio concluída");
 });
 it("sends once under concurrent API retries and refuses key reuse with another body",async()=>{
  const key=randomUUID();const body={text:"Mensagem aprovada de teste",approvedByHuman:true};
  const responses=await Promise.allSettled([sendApiChatMessage(a.ctx,id,key,body),sendApiChatMessage(a.ctx,id,key,body)]);
  expect(responses.some(r=>r.status==="fulfilled")).toBe(true);
  const retry=await sendApiChatMessage(a.ctx,id,key,body);expect(retry.status).toBe("SENT");
  const sent=fake.requests.filter(r=>r.path.endsWith("/messages")&&JSON.stringify(r.body).includes(body.text));expect(sent).toHaveLength(1);
  await expect(sendApiChatMessage(a.ctx,id,key,{...body,text:"Outro texto"})).rejects.toThrow("outro conteúdo");
  await expect(sendApiChatMessage(a.ctx,id,randomUUID(),{...body,approvedByHuman:false})).rejects.toThrow();
 });
 it("uses real receipt status in campaign reporting and ignores an older receipt",async()=>{
  const sent=await sendMessage(a.ctx,id,"Recibo de teste");const m=await db.whatsappMessage.findUniqueOrThrow({where:{id:sent.id}});
  const camp=await db.whatsappCampaign.create({data:{organizationId:a.org.id,accountId,name:"Recibos",text:"Teste"}});
  const r=await db.whatsappCampaignRecipient.create({data:{organizationId:a.org.id,campaignId:camp.id,waId:"5571999991111",name:"Contato",status:"SENT"}});
  await db.$executeRaw`UPDATE whatsapp_campaign_recipients SET message_id=${sent.id}::uuid WHERE id=${r.id}::uuid`;
  await applyStatusUpdate(a.org.id,m.waMessageId!,"read",null);await applyStatusUpdate(a.org.id,m.waMessageId!,"sent",null);
  expect((await db.whatsappMessage.findUniqueOrThrow({where:{id:sent.id}})).status).toBe("READ");
  const report=await workbenchReport(a.ctx,{from:new Date(Date.now()-86400000),to:new Date(Date.now()+86400000)});
  expect(report.receipts).toContainEqual({status:"READ",total:1});
 });
 it("records requests without deleting history and honors campaign withdrawal",async()=>{
  await recordChatContactEvent(a.ctx,id,"DELETION_REQUEST",{note:"Cliente pediu exclusão para análise"});
  await recordChatContactEvent(a.ctx,id,"WITHDRAWAL",{note:"Cliente retirou autorização para campanhas"});
  expect(await db.whatsappBillingOptout.findUnique({where:{organizationId_waId:{organizationId:a.org.id,waId:"5571999991111"}}})).not.toBeNull();
  expect(await db.whatsappMessage.count({where:{conversationId:id}})).toBeGreaterThan(0);
  await expect(recordChatContactEvent(b.ctx,id,"CONSENT",{note:"Evidência"})).rejects.toThrow();
 });
 it("submits a fixed-body template and keeps it pending until synchronization",async()=>{
  const result=await submitMetaTemplate(a.ctx,{accountId,name:"modelo_teste",language:"pt_BR",category:"UTILITY",body:"Recebemos os documentos para conferência."});
  expect(result.status).toBe("PENDING");
  expect((await db.whatsappTemplate.findFirstOrThrow({where:{organizationId:a.org.id,name:"modelo_teste"}})).status).toBe("PENDING");
 });
 it("segments client status and exact tag, preserves schedule and requires authorization for imported lists",async()=>{
  await db.whatsappExtrasSettings.upsert({where:{organizationId:a.org.id},create:{organizationId:a.org.id,campaignsEnabled:true},update:{campaignsEnabled:true}});
  await db.client.createMany({data:[{organizationId:a.org.id,type:"PERSON",name:"Segmento ativo",phone:"5571999993333",status:"ACTIVE",tags:["campanha-teste"]},{organizationId:a.org.id,type:"PERSON",name:"Segmento inativo",phone:"5571999994444",status:"INACTIVE",tags:["campanha-teste"]}]});
  const options=await campaignClientOptions(a.ctx,{clientTag:"campanha-teste",clientStatus:"ACTIVE"});expect(options.total).toBe(1);
  const template=await db.whatsappTemplate.create({data:{organizationId:a.org.id,name:"aprovado_teste",language:"pt_BR",body:"Olá",status:"APPROVED",variableCount:0}});
  const scheduledAt=new Date(Date.now()+86400000);
  const c=await createCampaign(a.ctx,{name:"Segmento ativo",text:"Olá",allMatching:true,clientTag:"campanha-teste",clientStatus:"ACTIVE",templateId:template.id,scheduledAt});
  expect(c.status).toBe("DRAFT");expect(c.scheduledAt?.toISOString()).toBe(scheduledAt.toISOString());expect((await campaignReport(a.ctx,c.id)).total).toBe(1);
  const raw={name:"Importação autorizada",text:"Olá",templateId:template.id,imported:[{name:"Importado",phone:"5571999995555"}]};
  await expect(createCampaign(a.ctx,raw)).rejects.toThrow("autorização");
  const imported=await createCampaign(a.ctx,{...raw,importConsent:true});expect((await campaignReport(a.ctx,imported.id)).total).toBe(1);expect(imported.status).toBe("DRAFT");
 });
});
