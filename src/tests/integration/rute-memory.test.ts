import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { archiveMemory, listMemories, memoryContext, saveMemory, validateMemoryScope } from "@/server/services/rute-memory.service";
import { createConversation, sendMessage } from "@/server/services/rute-assistant.service";
import { __setToolChatForTests } from "@/lib/ai/tool-chat";
import { setOrgAiEnabled } from "@/server/services/ai.service";
import { setRuteFeature } from "@/server/services/rute-settings.service";
import { makeOrgWithOwner } from "./helpers";
describe("RUTE personal memory and desktop context",()=>{
 let a:Awaited<ReturnType<typeof makeOrgWithOwner>>,b:Awaited<ReturnType<typeof makeOrgWithOwner>>;
 let clientId:string,caseId:string,secretId:string;
 beforeAll(async()=>{
  a=await makeOrgWithOwner("memory-a");b=await makeOrgWithOwner("memory-b");
  clientId=(await db.client.create({data:{organizationId:a.org.id,name:"Memory client",type:"PERSON"}})).id;
  const create=(title:string,confidential=false)=>db.case.create({data:{organizationId:a.org.id,title,confidential,parties:{create:{organizationId:a.org.id,clientId,name:"Memory client",role:"PLAINTIFF",isOurClient:true}}}});
  caseId=(await create("Memory case")).id;secretId=(await create("Private case",true)).id;
  await setOrgAiEnabled(a.ctx,true);await setRuteFeature(a.ctx,"assistant",true);
 });
 afterEach(()=>__setToolChatForTests(undefined));
 it("isolates private memories by user and office and masks identifiers",async()=>{
  const saved=await saveMemory(a.ctx,{body:"Resumos curtos. CPF 529.982.247-25, teste@example.com"});
  const mine=(await listMemories(a.ctx)).memories.find(m=>m.id===saved.id)!;
  expect(mine.body).toContain("[CPF]");expect(mine.body).toContain("[E-MAIL]");
  expect((await listMemories(b.ctx)).memories).toHaveLength(0);
  const another={...a.ctx,userId:b.ctx.userId};
  expect((await listMemories(another)).memories).toHaveLength(0);
  await expect(archiveMemory(another,saved.id)).rejects.toThrow();
 });
 it("limits client/process memories to the selected and authorized context",async()=>{
  const scoped=await saveMemory(a.ctx,{clientId,body:"Contexto exclusivo do cliente"});
  const specific=await saveMemory(a.ctx,{clientId,caseId,body:"Contexto exclusivo do processo"});
  const secret=await saveMemory(a.ctx,{clientId,caseId:secretId,body:"Contexto sigiloso"});
  expect((await listMemories(a.ctx)).memories.some(m=>m.id===scoped.id)).toBe(false);
  const client=(await listMemories(a.ctx,{clientId})).memories;
  expect(client.some(m=>m.id===scoped.id)).toBe(true);expect(client.some(m=>m.id===specific.id||m.id===secret.id)).toBe(false);
  expect((await listMemories(a.ctx,{clientId,caseId})).memories.some(m=>m.id===specific.id)).toBe(true);
  const limited={...a.ctx,isOwner:false,permissions:new Set(["ai:use","clients:read","cases:read"] as const)};
  await expect(listMemories(limited,{clientId,caseId:secretId})).rejects.toThrow();
  expect(await memoryContext(limited,{clientId,caseId:secretId})).toBe("");
  await expect(validateMemoryScope(b.ctx,{clientId,caseId})).rejects.toThrow();
  const unrelated=(await db.client.create({data:{organizationId:a.org.id,type:"PERSON",name:"Unrelated client"}})).id;
  await expect(validateMemoryScope(a.ctx,{clientId:unrelated,caseId})).rejects.toThrow("vinculado");
 });
 it("archives notes and expires them under office retention",async()=>{
  const note=await saveMemory(a.ctx,{body:"Apagar do contexto futuro"});await archiveMemory(a.ctx,note.id);
  expect((await listMemories(a.ctx)).memories.some(m=>m.id===note.id)).toBe(false);
  const expired=await saveMemory(a.ctx,{body:"Memória antiga"});
  await db.$executeRaw`UPDATE rute_memories SET updated_at=now()-interval '800 days' WHERE id=${expired.id}::uuid`;
  expect((await listMemories(a.ctx)).memories.some(m=>m.id===expired.id)).toBe(false);
  const [{count}={count:1n}]=await db.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM rute_memories WHERE id=${expired.id}::uuid`;expect(Number(count)).toBe(0);
 });
 it("loads explicitly saved preferences into a new conversation without granting write access",async()=>{
  await saveMemory(a.ctx,{body:"Prefiro respostas em três tópicos objetivos."});
  __setToolChatForTests({name:"test",model:"test",async run(input){
   expect(input.system).toContain("três tópicos objetivos");expect(input.system).toContain("não autorizam ações");
   expect(input.tools.some(t=>t.name==="criar_tarefa")).toBe(false);
   return {text:"Resumo em três tópicos.",inputTokens:1,outputTokens:1,model:"test",toolCalls:0};
  }});
  const conv=await createConversation(a.ctx);await sendMessage(a.ctx,conv.id,"Organize meu dia",{mode:"consult"});
 });
});
