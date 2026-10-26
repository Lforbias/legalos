import {z} from "zod";
import {db} from "@/lib/db/client";
import {isYmd} from "@/lib/dates/ymd";
import {NotFoundError} from "@/lib/permissions/check";
import type {ToolDef} from "./rute-tools.service";
import {activityFilterSchema,listActivities} from "./activity.service";
import {activityDetails} from "./activity-details.service";
import {getActivitySeries} from "./activity-series.service";
import {financeSummary,listEntries} from "./finance.service";
import {teamReport,resolvePeriod} from "./report.service";
import {listRepository} from "./document.service";
import {searchDocumentContent} from "./document-text.service";
import {listLeads,getLead} from "./crm.service";
import {LEAD_STAGES} from "@/modules/crm/schemas";
import {caseVisibility} from "./case.service";
import {listPackages} from "./workflow-package.service";
const str=(description:string)=>({type:"string",description});
const date=z.string().refine(isYmd,"Use AAAA-MM-DD.");
const range={from:date.optional(),to:date.optional()};
const rangeProperties={from:str("Data inicial AAAA-MM-DD"),to:str("Data final AAAA-MM-DD; máximo 366 dias")};
const activityTarget=z.object({kind:z.enum(["TASK","EVENT","DEADLINE"]),id:z.uuid()});
const conversationVisibility=(ctx:Parameters<typeof caseVisibility>[0])=>({OR:[{caseId:null},{case:{AND:[{deletedAt:null},caseVisibility(ctx)]}}]});
/** Extensões do catálogo único: retornam dados, nunca consomem mensagens nem executam ações externas. */
export const EXPANDED_TOOLS:ToolDef[]=[
 {name:"listar_atividades",title:"Atividades da agenda e gestão",scope:"read",permission:"ai:use",description:"Consulta tarefas, compromissos e prazos nos registros originais usados pela agenda e quadro. Filtra período, tipo, responsável e processo; declara limite de 300. Sem data inicial/final inclui tarefas sem data.",input:{type:"object",properties:{...rangeProperties,kind:str("TASK, EVENT ou DEADLINE"),assigneeId:str("UUID do responsável"),caseId:str("UUID do processo"),clientId:str("UUID do cliente; inclui atividades diretamente vinculadas e dos processos em que é parte"),q:str("Título"),includeClosed:{type:"boolean"}}},schema:activityFilterSchema,run:async(ctx,a)=>listActivities(ctx,a)},
 {name:"ver_detalhes_atividade",title:"Checklists, colaboradores e série",scope:"read",permission:"ai:use",description:"Consulta checklist e participantes de atividade visível; para tarefas e compromissos inclui regra e tamanho da recorrência. Marcar checklist não conclui a atividade.",input:{type:"object",properties:{kind:str("TASK, EVENT ou DEADLINE"),id:str("UUID da atividade")},required:["kind","id"]},schema:activityTarget,run:async(ctx,a)=>{const v=activityTarget.parse(a);return {...await activityDetails(ctx,v.kind,v.id),serie:v.kind==="DEADLINE"?null:await getActivitySeries(ctx,v.kind,v.id)};}},
 {name:"resumo_financeiro",title:"Posição financeira atual",scope:"read",permission:"finance:read",description:"Saldos e valores financeiros atuais calculados pelo serviço do financeiro. Não efetua cobrança, pagamento ou transferência.",input:{type:"object",properties:{}},schema:z.object({}),run:async ctx=>({moeda:"BRL",consultado_em:new Date().toISOString(),...await financeSummary(ctx)})},
 {name:"buscar_lancamentos",title:"Consultar lançamentos financeiros",scope:"read",permission:"finance:read",description:"Lista contas a receber/pagar por vencimento e situação. Retorna total e somas do filtro, página de até 50; valor pago não é receita futura. Não muda lançamentos.",input:{type:"object",properties:{...rangeProperties,kind:str("RECEIVABLE ou PAYABLE"),status:str("aberto, vencido, pago, cancelado ou todos"),q:str("Descrição"),caseId:str("UUID do processo"),clientId:str("UUID do cliente"),page:{type:"integer",minimum:1,maximum:1000}}},schema:z.object({...range,kind:z.enum(["RECEIVABLE","PAYABLE"]).optional(),status:z.enum(["aberto","vencido","pago","cancelado","todos"]).optional(),q:z.string().max(80).optional(),caseId:z.uuid().optional(),clientId:z.uuid().optional(),page:z.number().int().min(1).max(1000).optional()}),run:async(ctx,a)=>{const r=await listEntries(ctx,a);return {...r,items:r.items.map(i=>({id:i.id,descricao:i.description,tipo:i.kind,situacao:i.status,valor:i.amount.toString(),pago:i.paidAmount.toString(),vencimento:i.dueDate.toISOString().slice(0,10),cliente:i.clientName,processo:i.caseTitle})),moeda:"BRL"};}},
 {name:"produtividade_equipe",title:"Produtividade da equipe",scope:"read",permission:"productivity:read",description:"Relatório de produtividade da equipe no período, com mesmos cálculos da tela Relatórios. Exige também reports:read. Informa quando há truncamento.",input:{type:"object",properties:rangeProperties},schema:z.object(range),run:async(ctx,a)=>{const p=resolvePeriod(ctx,a.from as string|undefined,a.to as string|undefined);const r=await teamReport(ctx,p);return {from:p.from,to:p.to,...r.data,limitado:r.truncated};}},
 {name:"buscar_documentos",title:"Buscar documentos do repositório",scope:"read",permission:"documents:read",description:"Busca metadados de arquivos visíveis do repositório pelo nome, categoria ou vínculo. Não retorna conteúdo binário, chave de armazenamento nem URLs privadas. Links externos vinculados são consultados na ficha do processo/cliente.",input:{type:"object",properties:{q:str("Parte do nome"),category:str("Categoria"),scope:str("case ou client")}},schema:z.object({q:z.string().max(100).optional(),category:z.string().max(50).optional(),scope:z.enum(["case","client"]).optional()}),run:async(ctx,a)=>{const r=await listRepository(ctx,a);return {total:r.total,limitado:r.truncated||r.items.length>50,documentos:r.items.slice(0,50).map(d=>({id:d.id,nome:d.name,categoria:d.category,versao:d.currentVersion,tamanho:d.sizeBytes,processo:d.case,cliente:d.client}))};}},
 {name:"buscar_conteudo_documentos",title:"Buscar texto já extraído",scope:"read",permission:"documents:read",description:"Pesquisa no texto já extraído dos documentos visíveis. Não faz OCR nem extrai novos arquivos; ausência de resultado não prova ausência de documento.",input:{type:"object",properties:{q:str("Texto a buscar, mínimo 2 caracteres")},required:["q"]},schema:z.object({q:z.string().trim().min(2).max(100)}),run:async(ctx,a)=>searchDocumentContent(ctx,a.q as string)},
 {name:"buscar_oportunidades",title:"Oportunidades do CRM",scope:"read",permission:"crm:read",description:"Consulta oportunidades do CRM por nome, etapa e responsável. Inclui totais do filtro e resumo geral do funil, explicitamente distintos. Retorna até 50 oportunidades sem contatos pessoais.",input:{type:"object",properties:{q:str("Parte do nome/interesse"),stage:str(LEAD_STAGES.join(", ")),ownerId:str("UUID do responsável")}},schema:z.object({q:z.string().max(80).optional(),stage:z.enum(LEAD_STAGES).optional(),ownerId:z.uuid().optional()}),run:async(ctx,a)=>{const r=await listLeads(ctx,a);return {total_filtrado:r.total,limitado:r.total>50,funil_geral:r.summary,oportunidades:r.items.slice(0,50)};}},
 {name:"ver_oportunidade",title:"Detalhes da oportunidade",scope:"read",permission:"crm:read",description:"Consulta etapa, interesse, histórico e propostas comerciais de uma oportunidade do CRM. Não converte nem altera o lead.",input:{type:"object",properties:{id:str("UUID do lead")},required:["id"]},schema:z.object({id:z.uuid()}),run:async(ctx,a)=>{const {lead:l}=await getLead(ctx,a.id as string);return {id:l.id,nome:l.name,etapa:l.stage,interesse:l.interest,responsavel:l.ownerId,proxima_acao:l.nextActionDate,atividades:l.activities,propostas:l.proposals};}},
 {
  name: "listar_conversas_chat", title: "Buscar conversas do Chat", scope: "read", permission: "whatsapp:read",
  description: "Localiza conversas pelo nome do contato (q), nome do cliente vinculado (q) ou UUID do cliente (clientId). Para procurar uma pessoa sem restringir situação use status=ALL; OPEN é o padrão. Retorna IDs para ler_conversa_chat, sem exigir que a pessoa saiba o número da conversa. Até 50 por página; se houver homônimos, confirme qual é. Respeita sigilo e não marca como lida, envia mensagens ou retorna telefones.",
  input: {type: "object", properties: {
   q: str("Nome ou parte do nome do contato/cliente; palavras podem estar em outra ordem"),
   clientId: str("UUID do cliente vinculado, obtido em buscar_clientes"),
   status: {type: "string", enum: ["OPEN", "CLOSED", "ALL"], description: "ALL busca abertas e encerradas; padrão OPEN"},
   mine: {type: "boolean", description: "Somente atribuídas a mim; não significa todas do escritório"},
   page: {type: "integer", minimum: 1, maximum: 1000}, limit: {type: "integer", minimum: 1, maximum: 50},
  }},
  schema: z.object({q: z.string().trim().max(100).optional(), clientId: z.uuid().optional(), status: z.enum(["OPEN", "CLOSED", "ALL"]).default("OPEN"), mine: z.boolean().default(false), page: z.number().int().min(1).max(1000).default(1), limit: z.number().int().min(1).max(50).default(50)}),
  run: async(ctx, a) => {
   const page = a.page as number, limit = a.limit as number;
   const words = (a.q as string | undefined)?.split(/\s+/).filter(Boolean) ?? [];
   const where = {organizationId: ctx.organizationId, AND: [
    conversationVisibility(ctx),
    ...(a.status !== "ALL" ? [{status: a.status as string}] : []),
    ...(a.mine ? [{assignedToId: ctx.userId}] : []),
    ...(a.clientId ? [{clientId: a.clientId as string}] : []),
    ...words.map(word => ({OR: [
     {contactName: {contains: word, mode: "insensitive" as const}},
     {client: {organizationId: ctx.organizationId, deletedAt: null, name: {contains: word, mode: "insensitive" as const}}},
    ]})),
   ]};
   const [total, items] = await Promise.all([
    db.whatsappConversation.count({where}),
    db.whatsappConversation.findMany({where, take: limit, skip: (page - 1) * limit, orderBy: [{lastMessageAt: {sort: "desc", nulls: "last"}}, {id: "asc"}], select: {id: true, contactName: true, status: true, serviceStatus: true, unreadCount: true, lastMessageAt: true, assignedToId: true, caseId: true, clientId: true, account: {select: {label: true}}}}),
   ]);
   return {total, page, pages: Math.ceil(total / limit), limit, limitado: total > items.length, tem_mais: page * limit < total, conversas: items};
  },
 },
 {
  name: "ler_conversa_chat", title: "Ler conversa sem marcar como lida", scope: "read", permission: "whatsapp:read",
  description: "Lê mensagens da conversa localizada em listar_conversas_chat. Para saber a última mensagem que o cliente enviou use direction=IN e limit=1; OUT são respostas da equipe e NOTE são notas internas/eventos, nunca fala do cliente. ALL inclui todas (padrão). Retorna da mais antiga para a mais recente dentro da página; página 1 contém as mais recentes. Não transcreve áudio nem interpreta anexos sem texto. Não envia recibo de leitura nem zera não lidas.",
  input: {type: "object", properties: {id: str("UUID da conversa retornado em listar_conversas_chat"), direction: {type: "string", enum: ["IN", "OUT", "NOTE", "ALL"]}, limit: {type: "integer", minimum: 1, maximum: 50}, page: {type: "integer", minimum: 1, maximum: 1000}}, required: ["id"]},
  schema: z.object({id: z.uuid(), direction: z.enum(["IN", "OUT", "NOTE", "ALL"]).default("ALL"), limit: z.number().int().min(1).max(50).default(50), page: z.number().int().min(1).max(1000).default(1)}),
  run: async(ctx, a) => {
   const c = await db.whatsappConversation.findFirst({where: {id: a.id as string, organizationId: ctx.organizationId, ...conversationVisibility(ctx)}, select: {id: true, contactName: true, status: true, serviceStatus: true, unreadCount: true}});
   if (!c) throw new NotFoundError("Conversa não encontrada.");
   const page = a.page as number, limit = a.limit as number;
   const where = {organizationId: ctx.organizationId, conversationId: c.id, ...(a.direction !== "ALL" ? {direction: a.direction as string} : {})};
   const [total, rows] = await Promise.all([
    db.whatsappMessage.count({where}),
    db.whatsappMessage.findMany({where, orderBy: [{createdAt: "desc"}, {id: "desc"}], take: limit, skip: (page - 1) * limit, select: {id: true, direction: true, type: true, body: true, status: true, createdAt: true}}),
   ]);
   return {conversa: c, mensagens: rows.reverse(), total, direction: a.direction, page, pages: Math.ceil(total / limit), limit, limitado: total > rows.length, tem_mais: page * limit < total};
  },
 },
 {name:"listar_pacotes_workflow",title:"Pacotes e regras de workflow",scope:"read",permission:"tasks:read",description:"Lista pacotes com etapas, datas relativas, contagem, dependências e seleção de responsável. Não executa o pacote.",input:{type:"object",properties:{}},schema:z.object({}),run:async ctx=>(await listPackages(ctx)).map(p=>({id:p.id,nome:p.name,ativo:p.active,etapas:p.steps.map(s=>({id:s.id,titulo:s.title,pergunta:s.ask,descricao:s.description,dias:s.dueDays,contagem:s.countType,referencia:s.relativeTo,aguardar_anterior:s.waitForPrevious,responsavel:s.assigneeMode,usuario:s.assigneeId}))}))},
];
