import {describe,it,expect,afterEach} from "vitest";
import {db} from "@/lib/db/client";
import {makeOrgWithOwner} from "./helpers";
import {createCampaign,campaignReport,campaignClientOptions,approveCampaign,runCampaigns} from "@/server/services/chat-campaigns.service";
import {applyInboundLifecycle,humanReplyLifecycle,setServiceStatus} from "@/server/services/chat-lifecycle.service";
import {ingestQrCall,recordManualCall} from "@/server/services/chat-calls.service";
import {fakeDriver,fakeQr} from "@/lib/whatsapp/qr/fake-driver";
import {setQrDriver} from "@/lib/whatsapp/qr";
import {startQrSession,stopQrSession,restartQr} from "@/server/services/whatsapp-qr.service";
import {startEnrollment,confirmEnrollment} from "@/server/services/mfa.service";
import {totpCode,totpStep} from "@/lib/security/totp";
import {META} from "./helpers";
const orgs:string[]=[];const saved={...process.env};
afterEach(async()=>{for(const a of await db.whatsappAccount.findMany({where:{organizationId:{in:orgs}},select:{id:true}}))await stopQrSession(a.id,{logout:false});await db.whatsappAccount.deleteMany({where:{organizationId:{in:orgs.splice(0)}}});setQrDriver(null);process.env={...saved};});
async function fixture(label:string){const a=await makeOrgWithOwner(label);orgs.push(a.org.id);const account=await db.whatsappAccount.create({data:{organizationId:a.org.id,label:"Atendimento",provider:"QR",riskAckAt:new Date(),enabled:true}});return {...a,account};}
describe("Rodada Chat — campanhas, situações, ligações e pareamento",()=>{
 it("cria 2.601 destinatários atomicamente, pesquisa e relata com paginação, respeita exclusões e aprovação",async()=>{
  const a=await fixture("large-campaign"),b=await makeOrgWithOwner("other-campaign");
  await db.whatsappExtrasSettings.create({data:{organizationId:a.org.id,campaignsEnabled:true}});
  await db.client.createMany({data:Array.from({length:2601},(_,i)=>({organizationId:a.org.id,type:"PERSON",name:`Campanha ${String(i).padStart(4,"0")}`,phone:`55719${String(i).padStart(7,"0")}`}))});
  const c=await db.client.findFirstOrThrow({where:{organizationId:a.org.id}});await db.whatsappBillingOptout.create({data:{organizationId:a.org.id,waId:c.phone!}});
  const page=await campaignClientOptions(a.ctx,{page:26});expect(page.total).toBe(2601);expect(page.items).toHaveLength(100);
  const campaign=await createCampaign(a.ctx,{name:"Aviso geral",text:"Olá {nome}",allMatching:true});
  expect(campaign.status).toBe("DRAFT");const rep=await campaignReport(a.ctx,campaign.id,27);expect(rep.total).toBe(2601);expect(rep.recipients).toHaveLength(1);expect(await db.whatsappCampaignRecipient.count({where:{campaignId:campaign.id,status:"SKIPPED"}})).toBe(1);
  expect(await db.whatsappMessage.count({where:{organizationId:a.org.id}})).toBe(0);
  await expect(campaignReport(b.ctx,campaign.id)).rejects.toThrow();
 });
 it("limita lotes concorrentes e não reenvia resultados incertos após interrupção",async()=>{
  const a=await fixture("campaign-batch");await db.whatsappExtrasSettings.create({data:{organizationId:a.org.id,campaignsEnabled:true}});
  await db.client.createMany({data:Array.from({length:41},(_,i)=>({organizationId:a.org.id,type:"PERSON",name:`Contato ${i}`,phone:`557198888${String(i).padStart(4,"0")}`}))});
  const c=await createCampaign(a.ctx,{name:"Lote seguro",text:"Olá {nome}",allMatching:true});await approveCampaign(a.ctx,c.id);const now=new Date();
  await Promise.all([runCampaigns(now),runCampaigns(now)]);expect(await db.whatsappCampaignRecipient.count({where:{campaignId:c.id,status:"PENDING"}})).toBe(21);
  const row=await db.whatsappCampaignRecipient.findFirstOrThrow({where:{campaignId:c.id,status:"PENDING"}});await db.whatsappCampaignRecipient.update({where:{id:row.id},data:{status:"SENDING",claimedAt:new Date(now.getTime()-11*60000)}});
  await runCampaigns(new Date(now.getTime()+61000));expect((await db.whatsappCampaignRecipient.findUniqueOrThrow({where:{id:row.id}})).status).toBe("UNKNOWN");
 });
 it("mantém status personalizados e só respostas humanas iniciam atendimento, com reabertura sem regressão por evento antigo",async()=>{
  const a=await fixture("lifecycle");const c=await db.whatsappConversation.create({data:{organizationId:a.org.id,accountId:a.account.id,waId:"5571999991000",assignedToId:a.owner.id}});
  await db.whatsappConversation.update({where:{id:c.id},data:{status:"CLOSED"}});expect((await db.whatsappConversation.findUniqueOrThrow({where:{id:c.id}})).serviceStatus).toBe("CLOSED");
  await humanReplyLifecycle(a.org.id,c.id);expect((await db.whatsappConversation.findUniqueOrThrow({where:{id:c.id}})).serviceStatus).toBe("IN_SERVICE");
  await setServiceStatus(a.ctx,c.id,"WAITING");await applyInboundLifecycle(a.org.id,c.id,new Date());expect((await db.whatsappConversation.findUniqueOrThrow({where:{id:c.id}})).serviceStatus).toBe("IN_SERVICE");
  await setServiceStatus(a.ctx,c.id,"RESOLVED");const old=new Date(Date.now()-31*60000);await db.whatsappConversation.update({where:{id:c.id},data:{closedAt:old,lastMessageAt:old}});
  expect((await applyInboundLifecycle(a.org.id,c.id,new Date())).reassign).toBe(true);expect((await db.whatsappConversation.findUniqueOrThrow({where:{id:c.id}})).assignedToId).toBeNull();
  await setServiceStatus(a.ctx,c.id,"CLOSED");expect((await applyInboundLifecycle(a.org.id,c.id,old)).stale).toBe(true);expect((await db.whatsappConversation.findUniqueOrThrow({where:{id:c.id}})).status).toBe("CLOSED");
 });
 it("registra chamada uma vez, confirma atendimento só em accept, preserva fechamento e não abre janela de mensagem",async()=>{
  const a=await fixture("calls"),now=new Date();const e={id:"call-001",chat:"5571999991001",status:"offer" as const,video:true,at:now};
  await ingestQrCall(a.account.id,e);await ingestQrCall(a.account.id,e);await ingestQrCall(a.account.id,{...e,status:"accept",video:false});await ingestQrCall(a.account.id,{...e,status:"terminate"});await ingestQrCall(a.account.id,e);
  const msgs=await db.whatsappMessage.findMany({where:{organizationId:a.org.id,type:"call"}});expect(msgs).toHaveLength(1);expect(msgs[0]!.callData).toMatchObject({state:"terminate",accepted:true,video:true});
  const c=await db.whatsappConversation.findFirstOrThrow({where:{organizationId:a.org.id}});expect(c.lastInboundAt).toBeNull();await recordManualCall(a.ctx,c.id,{outcome:"MISSED",direction:"OUT"});expect(await db.whatsappMessage.count({where:{organizationId:a.org.id,type:"call"}})).toBe(2);
 });
 it("novo pareamento mantém IDs, mensagens e vínculos e pausa campanhas",async()=>{
  const a=await fixture("repair");process.env.CERT_ENCRYPTION_KEY=Buffer.alloc(32,7).toString("base64");process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,9).toString("base64");
  const enrollment=await startEnrollment(a.owner.id,a.owner.email);await confirmEnrollment(a.owner.id,totpCode(enrollment.secret,totpStep()),META);setQrDriver(fakeDriver);fakeQr.reset();await startQrSession(a.account.id);
  const c=await db.whatsappConversation.create({data:{organizationId:a.org.id,accountId:a.account.id,waId:"5571999991002"}});const msg=await db.whatsappMessage.create({data:{organizationId:a.org.id,conversationId:c.id,direction:"IN",type:"text",status:"RECEIVED",body:"Histórico preservado"}});
  const campaign=await db.whatsappCampaign.create({data:{organizationId:a.org.id,accountId:a.account.id,name:"Em andamento",text:"Aviso",status:"SENDING"}});
  await restartQr(a.ctx);expect((await db.whatsappMessage.findUniqueOrThrow({where:{id:msg.id}})).conversationId).toBe(c.id);expect((await db.whatsappConversation.findUniqueOrThrow({where:{id:c.id}})).accountId).toBe(a.account.id);expect((await db.whatsappCampaign.findUniqueOrThrow({where:{id:campaign.id}})).status).toBe("PAUSED");
 });
});
