import {describe,it,expect,afterEach} from "vitest";
import {db} from "@/lib/db/client";
import {makeOrgWithOwner,addMember} from "./helpers";
import {migrationDiagnostics,operationalDiagnostics} from "@/server/services/operational-diagnostics.service";
import {callTool,toolCatalog} from "@/server/services/rute-tools.service";
import {setRuteFeature} from "@/server/services/rute-settings.service";
import {approveProposal} from "@/server/services/rute-proposal.service";
describe("Diagnóstico e novas ferramentas compartilhadas",()=>{
 const accountOrgs:string[]=[];afterEach(async()=>{await db.whatsappAccount.deleteMany({where:{organizationId:{in:accountOrgs.splice(0)}}});});
 it("encontra mapa órfão, não altera dados e não expõe token",async()=>{
  const a=await makeOrgWithOwner("diagnostics"),b=await makeOrgWithOwner("diagnostics-b");
  const t=await db.task.create({data:{organizationId:a.org.id,title:"Destino existente"}});
  await db.importMap.createMany({data:[{organizationId:a.org.id,source:"astrea",entity:"task",externalId:"1",internalId:t.id},{organizationId:a.org.id,source:"astrea",entity:"task",externalId:"2",internalId:crypto.randomUUID()},{organizationId:b.org.id,source:"astrea",entity:"task",externalId:"3",internalId:crypto.randomUUID()}]});
  const report=await migrationDiagnostics(a.ctx);expect(report.mapas).toHaveLength(1);expect(report.mapas[0]).toMatchObject({mapeados:2,verificados:2,ausentes:1});expect(await db.importMap.count()).toBeGreaterThanOrEqual(3);
  accountOrgs.push(a.org.id);
  await db.whatsappAccount.create({data:{organizationId:a.org.id,label:"Conta",tokenEnc:"SEGREDO",phoneNumberId:"1234567890"}});
  const diagnostic=await operationalDiagnostics(a.ctx);expect(diagnostic.whatsapp.contas).toHaveLength(1);expect(JSON.stringify(diagnostic)).not.toContain("SEGREDO");expect(diagnostic.whatsapp.contas[0]!.ultima_entrada).toBeNull();
  const member=await addMember(a.org.id,"LAWYER","audit-denied");await expect(migrationDiagnostics(member.ctx)).rejects.toThrow();
 });
 it("consulta Chat sem consumir não lidas, respeita sigilo e compartilha propostas de checklist",async()=>{
  const a=await makeOrgWithOwner("expanded"),other=await makeOrgWithOwner("expanded-other");
  await setRuteFeature(a.ctx,"mcp",true,{consent:true});await setRuteFeature(a.ctx,"proposals",true);
  accountOrgs.push(a.org.id);
  const account=await db.whatsappAccount.create({data:{organizationId:a.org.id,label:"Conta",tokenEnc:"TESTE",phoneNumberId:"2345678901"}});
  const conversation=await db.whatsappConversation.create({data:{organizationId:a.org.id,accountId:account.id,waId:"5511999999999",unreadCount:3}});
  await db.whatsappMessage.create({data:{organizationId:a.org.id,conversationId:conversation.id,direction:"IN",type:"TEXT",status:"RECEIVED",body:"Contato exemplo@example.test"}});
  const origin={via:"API" as const,provider:"teste",connection:null};
  const read=await callTool(a.ctx,new Set(["read"]),origin,"ler_conversa_chat",{id:conversation.id});expect(read.ok).toBe(true);expect(JSON.stringify(read.data)).not.toContain("exemplo@example.test");expect(JSON.stringify(read.data)).not.toContain("5511999999999");expect((await db.whatsappConversation.findUniqueOrThrow({where:{id:conversation.id}})).unreadCount).toBe(3);
  await setRuteFeature(other.ctx,"mcp",true,{consent:true});expect((await callTool(other.ctx,new Set(["read"]),origin,"ler_conversa_chat",{id:conversation.id})).ok).toBe(false);
  const task=await db.task.create({data:{organizationId:a.org.id,title:"Tarefa de checklist"}});
  const p=await callTool(a.ctx,new Set(["propose"]),origin,"propor_checklist_tarefa",{taskId:task.id,title:"Conferência",items:["Conferir documento"]});expect(p.ok).toBe(true);expect(await db.activityChecklist.count({where:{organizationId:a.org.id}})).toBe(0);
  await approveProposal(a.ctx,(p.data as {id:string}).id);expect(await db.activityChecklist.count({where:{organizationId:a.org.id}})).toBe(1);
  expect(toolCatalog(a.ctx,new Set(["read"])).every(x=>x.scope==="read")).toBe(true);
 });
});
