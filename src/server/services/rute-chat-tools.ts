import { emailInbox,emailThread } from "./chat-email.service";
import { z } from "zod";
import type { ToolDef } from "./rute-tools.service";
import { aiAssistSchema } from "@/lib/whatsapp/workbench";
import { assistChat,chatContactDetails,listChatResources,applyChatMacro } from "./chat-workbench.service";
const defs: {name:string;title:string;description:string;scope:ToolDef["scope"];permission:ToolDef["permission"];schema:z.ZodType<Record<string,unknown>>;run:ToolDef["run"]}[]=[
 {name:"listar_atendimentos_email",title:"Atendimentos de e-mail",description:"Lista até 200 atendimentos de e-mail do escritório. Não importa nem envia mensagens.",scope:"read",permission:"whatsapp:read",schema:z.object({}),run:ctx=>emailInbox(ctx)},
 {name:"ler_atendimento_email",title:"Histórico de e-mail",description:"Consulta as últimas 100 mensagens de um atendimento de e-mail. Não retorna conteúdo binário de anexos e não envia respostas.",scope:"read",permission:"whatsapp:read",schema:z.object({id:z.uuid()}),run:(ctx,a)=>emailThread(ctx,a.id as string)},
 {name:"dados_atendimento_chat",title:"Protocolo e registros do atendimento",description:"Consulta protocolo, bloqueio, origens e registros de consentimento do atendimento visível. Pedido de exclusão é apenas um registro para análise.",scope:"read",permission:"whatsapp:read",schema:z.object({id:z.uuid()}),run:(ctx,a)=>chatContactDetails(ctx,a.id as string)},
 {name:"recursos_chat",title:"Base, macros e listas do Chat",description:"Lista recursos compartilhados do Chat para conhecer macros e orientações aprovadas. Não envia mensagens.",scope:"read",permission:"whatsapp:read",schema:z.object({}),run:ctx=>listChatResources(ctx)},
 {name:"sugerir_atendimento_chat",title:"Copiloto do atendimento",description:"Gera resposta, reescrita, tradução ou sugestão de classificação/encerramento. Consome IA do escritório, exige copiloto ligado e ai:use. Nunca aplica ou envia a sugestão automaticamente.",scope:"read",permission:"ai:use",schema:aiAssistSchema,run:(ctx,a)=>assistChat(ctx,a)},
 {name:"aplicar_macro_chat",title:"Aplicar macro interna do Chat",description:"Executa a macro escolhida: nota, etiquetas, fila e situação. O texto de resposta é devolvido como rascunho e NÃO é enviado. Confira recursos_chat antes de executar e não repita sem consultar o resultado.",scope:"execute",permission:"whatsapp:write",schema:z.object({id:z.uuid(),macroId:z.uuid()}),run:(ctx,a)=>applyChatMacro(ctx,a.id as string,a.macroId as string)},
];
export const CHAT_TOOLS:ToolDef[]=defs.map(d=>({...d,input:z.toJSONSchema(d.schema,{io:"input",unrepresentable:"any"}) as ToolDef["input"]}));
