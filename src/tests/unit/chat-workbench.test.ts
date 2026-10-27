import { describe,it,expect } from "vitest";
import { attendanceProtocol,viewHref,macroSchema } from "@/lib/whatsapp/workbench";
import { interactivePayload,metaTemplateSchema } from "@/lib/whatsapp/interactive";
import { parseWebhook } from "@/lib/whatsapp/parse";
import { parseCampaignContacts } from "@/lib/whatsapp/campaign-import";
describe("Chat workbench contracts",()=>{
 it("keeps a stable full protocol and only allows supported inbox filters",()=>{
  const id="12345678-1234-4234-8234-123456789012";
  expect(attendanceProtocol(id,"2026-10-26T12:00:00Z")).toBe("ATD-20261026-12345678-1234-4234-8234-123456789012");
  expect(viewHref({f:"mine",q:"nome",redirect:"https://example.com"})).toBe("/atendimento?f=mine&q=nome");
  expect(()=>viewHref({fila:"foreign-invalid"})).toThrow();
 });
 it("chooses buttons up to three short options and a list otherwise",()=>{
  expect(interactivePayload({body:"Escolha",options:[{id:"1",title:"Uma"}]}).type).toBe("button");
  expect(interactivePayload({body:"Escolha",options:Array.from({length:4},(_,i)=>({id:String(i),title:`Opção ${i}`}))}).type).toBe("list");
  expect(()=>interactivePayload({body:"Escolha",options:[{id:"1",title:"A"},{id:"1",title:"B"}]})).toThrow();
  expect(()=>interactivePayload({body:"Escolha",options:Array.from({length:11},(_,i)=>({id:String(i),title:String(i)}))})).toThrow();
 });
 it("maps a triage reply id to the stable numbered option despite title truncation",()=>{
  const body={object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:"123"},messages:[{id:"abc",from:"5571999999999",timestamp:"1793000000",type:"interactive",interactive:{list_reply:{id:"legalos:triage:2",title:"Uma opção muito longa"}}}]}}]}]};
  expect(parseWebhook(body)[0]?.messages[0]?.text).toBe("2");
 });
 it("does not accept a blank macro or an unsupported template declaration",()=>{
  expect(macroSchema.safeParse({}).success).toBe(false);
  expect(metaTemplateSchema.safeParse({accountId:"12345678-1234-4234-8234-123456789012",name:"teste_modelo",language:"pt_BR",category:"UTILITY",body:"Olá {{1}}"}).success).toBe(false);
 });
 it("imports explicit names and phones, deduplicates, and rejects ambiguous or malformed rows",()=>{
  expect(parseCampaignContacts("Nome;Telefone\nMaria;5571999991111\nMaria repetida;5571999991111")).toEqual([{name:"Maria",phone:"5571999991111"}]);
  expect(()=>parseCampaignContacts("Maria;telefone inválido")).toThrow("Linha");
  expect(()=>parseCampaignContacts("Maria;5571999991111;extra")).toThrow("Linha");
 });
});
