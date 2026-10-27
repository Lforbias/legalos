import { z } from "zod";
const option=z.object({id:z.string().trim().min(1).max(200),title:z.string().trim().min(1).max(24)});
export const interactiveSchema=z.object({
 body:z.string().trim().min(1).max(1024),
 options:z.array(option).min(1).max(10),
}).refine(v=>new Set(v.options.map(o=>o.id)).size===v.options.length,"Identificadores de opções repetidos.");
export function interactivePayload(raw:unknown) {
 const d=interactiveSchema.parse(raw);
 return d.options.length<=3&&d.options.every(o=>o.title.length<=20)
  ? {type:"button",body:{text:d.body},action:{buttons:d.options.map(o=>({type:"reply",reply:o}))}}
  : {type:"list",body:{text:d.body},action:{button:"Ver opções",sections:[{title:"Atendimento",rows:d.options}]}};
}
export const metaTemplateSchema=z.object({
 accountId:z.uuid(),name:z.string().regex(/^[a-z][a-z0-9_]{2,79}$/),
 language:z.enum(["pt_BR","en_US","es"]),category:z.enum(["UTILITY","MARKETING"]),
 body:z.string().trim().min(5).max(1024).refine(v=>!v.includes("{{"),"Este cadastro inicial aceita texto fixo, sem variáveis."),
});
