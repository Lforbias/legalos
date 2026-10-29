import { BOX_AVAILABLE } from "@/lib/box-retirement";
import {db} from "@/lib/db/client";
import {assertCan,can,type TenantContext} from "@/server/context";
import {caseVisibility} from "./case.service";
import {webhookConfigured,whatsappKeyAvailable} from "./whatsapp-account.service";
import {connectionSupports} from "@/lib/connectors/capabilities";
import {toCents} from "@/lib/finance/money";

/** Somente leitura: configuração e evidência persistida são mostradas separadamente. Não abre intimações, não envia mensagens. */
export async function operationalDiagnostics(ctx:TenantContext){
 assertCan(ctx,"integrations:manage");
 const org={organizationId:ctx.organizationId};
 const [accounts,connections,monitors]=await Promise.all([
  can(ctx,"whatsapp:manage")?db.whatsappAccount.findMany({where:org,select:{id:true,label:true,provider:true,enabled:true,qrState:true,lastCheckAt:true,lastStatus:true}}):Promise.resolve([]),
  BOX_AVAILABLE ? db.courtConnection.findMany({where:org,select:{id:true,label:true,system:true,environment:true,authProfile:true,enabled:true,wsdlStatus:true,wsdlCheckedAt:true,wsdlOperations:true,lastStatus:true,lastSyncAt:true,certificate:{select:{notAfter:true,revokedAt:true}}}}):Promise.resolve([]),
  BOX_AVAILABLE ? db.djenMonitor.findMany({where:org,select:{label:true,enabled:true,lastSyncAt:true,lastStatus:true}}):Promise.resolve([]),
 ]);
 const whatsapp=[];
 for(const a of accounts){
  const [inbound,outbound,failed]=await Promise.all([
   db.whatsappMessage.findFirst({where:{...org,conversation:{accountId:a.id},direction:"IN"},orderBy:{createdAt:"desc"},select:{createdAt:true}}),
   db.whatsappMessage.findFirst({where:{...org,conversation:{accountId:a.id},direction:"OUT",status:{in:["SENT","DELIVERED","READ"]}},orderBy:{createdAt:"desc"},select:{createdAt:true,status:true}}),
   db.whatsappMessage.count({where:{...org,conversation:{accountId:a.id},direction:"OUT",status:"FAILED"}}),
  ]);
  whatsapp.push({...a,ultima_entrada:inbound?.createdAt??null,ultima_saida:outbound?.createdAt??null,status_saida:outbound?.status??null,falhas_envio:failed,proximo_passo:!a.enabled?"Ativar a conta nas configurações do Chat.":a.provider==="QR"&&a.qrState!=="CONNECTED"?"Conectar pelo QR e testar recebimento e resposta.":!inbound||!outbound?"Enviar uma mensagem ao número e responder pelo Chat para validar as duas direções.":"Há evidência de entrada e saída; confira as datas e teste entrega/leitura com um contato autorizado."});
 }
 return {consultado_em:new Date().toISOString(),somente_leitura:true,whatsapp:{permitido:can(ctx,"whatsapp:manage"),cofre_disponivel:whatsappKeyAvailable(),webhook_meta_configurado:webhookConfigured(),contas:whatsapp},tribunais:connections.map(c=>({...c,certificado:c.certificate?{valido:!c.certificate.revokedAt&&c.certificate.notAfter>new Date(),vence:c.certificate.notAfter}:null,certificate:undefined,operacoes:{avisos:connectionSupports(c,"consultarAvisosPendentes"),processo:connectionSupports(c,"consultarProcesso"),peticionamento:connectionSupports(c,"entregarManifestacaoProcessual")},homologacao_real:"PENDENTE — contrato compatível ou sincronização anterior não comprovam protocolo homologado."})),djen:monitors};
}

type Check={entidade:string;mapeados:number;verificados:number;ausentes:number;exemplos:string[];nao_suportada?:boolean};
/** Compara os mapas Astrea com destinos existentes, sem alterar nem baixar links. A origem CSV deve ser reconciliada separadamente. */
export async function migrationDiagnostics(ctx:TenantContext){
 assertCan(ctx,"organization:manage");
 const org={organizationId:ctx.organizationId};
 const grouped=await db.importMap.groupBy({by:["entity"],where:{...org,source:"astrea"},_count:{_all:true}});
 const checks:Check[]=[];
 for(const group of grouped){
  const check:Check={entidade:group.entity,mapeados:group._count._all,verificados:0,ausentes:0,exemplos:[]};let cursor:string|undefined;
  while(true){
   const batch=await db.importMap.findMany({where:{...org,source:"astrea",entity:group.entity},orderBy:{id:"asc"},take:1000,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,internalId:true}});if(!batch.length)break;
   const where={...org,id:{in:batch.map(m=>m.internalId)}};const select={id:true};
   const rows=group.entity==="client"?await db.client.findMany({where,select}):group.entity==="case"?await db.case.findMany({where,select}):group.entity==="task"?await db.task.findMany({where,select}):group.entity==="deadline"?await db.deadline.findMany({where,select}):["event","hearing"].includes(group.entity)?await db.agendaEvent.findMany({where,select}):group.entity==="notice"?await db.courtNotice.findMany({where,select}):group.entity==="history"?await db.caseEvent.findMany({where,select}):group.entity==="linked_doc"?await db.linkedDocument.findMany({where,select}):group.entity==="fin_entry"?await db.financeEntry.findMany({where,select}):group.entity==="fin_account"?await db.financeAccount.findMany({where,select}):group.entity==="fin_category"?await db.financeCategory.findMany({where,select}):group.entity==="fin_cost_center"?await db.costCenter.findMany({where,select}):null;
   if(!rows){check.nao_suportada=true;break;}
   const ids=new Set(rows.map(x=>x.id));check.verificados+=batch.length;
   for(const map of batch)if(!ids.has(map.internalId)){check.ausentes++;if(check.exemplos.length<5)check.exemplos.push(map.id);}
   cursor=batch.at(-1)!.id;
  }
  checks.push(check);
 }
 const visible={AND:[org,{deletedAt:null},caseVisibility(ctx)]};
 const [links,docs,missingDate,comments,states,finance]=await Promise.all([
  can(ctx,"documents:read")?db.linkedDocument.count({where:{...org,source:"ASTREA",deletedAt:null,OR:[{caseId:null},{caseId:{in:(await db.case.findMany({where:visible,select:{id:true}})).map(x=>x.id)}}]}}):null,
  can(ctx,"documents:read")?db.document.count({where:{...org,deletedAt:null}}):null,
  can(ctx,"tasks:read")?db.task.count({where:{...org,deletedAt:null,dueDate:null,id:{in:(await db.importMap.findMany({where:{...org,source:"astrea",entity:"task"},select:{internalId:true}})).map(x=>x.internalId)}}}):null,
  can(ctx,"tasks:read")?db.taskComment.count({where:org}):null,
  can(ctx,"tasks:read")?db.task.groupBy({by:["status"],where:{...org,deletedAt:null},_count:{_all:true}}):null,
  can(ctx,"finance:read")?db.financeEntry.findMany({where:org,select:{amount:true,paidAmount:true},take:50001}):null,
 ]);
 let inconsistent=0;for(const e of finance?.slice(0,50000)??[]){const amount=toCents(e.amount.toString()),paid=toCents(e.paidAmount.toString());if(amount===null||paid===null||amount<0n||paid<0n||paid>amount)inconsistent++;}
 return {somente_leitura:true,consultado_em:new Date().toISOString(),mapas:checks,links_astrea:links,arquivos_repositorio:docs,tarefas_importadas_sem_data:missingDate,comentarios_no_sistema:comments,estados_tarefas:states,financeiro:finance?{amostra:Math.min(finance.length,50000),limitado:finance.length>50000,valores_inconsistentes:inconsistent}:null,limites:["Confere existência dos destinos; registros excluídos logicamente continuam existindo. Não valida igualdade com a exportação original.","Links não são arquivos binários e não tiveram disponibilidade externa testada. Quantidade de arquivos não comprova integridade do armazenamento.","Comentários e estados são totais atuais; sem exportação original não se conclui perda ou completude. Tarefa sem data pode ser legítima.","Não corrige registros nem recalcula saldos. Conciliação financeira com a origem e verificação dos arquivos continuam necessárias."]};
}
