import {z} from "zod";
import {db} from "@/lib/db/client";
import {groundedSearch} from "@/lib/ai/grounded-search";
import {maskSensitive} from "@/lib/ai/mask";
import {ConflictError} from "@/lib/permissions/check";
import {AiProviderError} from "@/lib/ai/provider";
import type {TenantContext} from "@/server/context";
import {gate} from "./ai-tools.service";
import {officeProviderKey,DEFAULT_MODELS} from "./rute-settings.service";
import {audit} from "./audit.service";
/** Pesquisa pública independente do processo: não envia contexto, documentos, nomes de partes ou histórico do escritório. */
export async function searchJurisprudence(ctx:TenantContext,raw:string){
 const question=maskSensitive(z.string().trim().min(10).max(1500).parse(raw));await gate(ctx);
 const settings=await db.ruteSettings.findUnique({where:{organizationId:ctx.organizationId},select:{provider:true,model:true,emergencyStop:true}});
 if(settings?.emergencyStop)throw new ConflictError("A IA está em parada de emergência.");
 if(settings?.provider!=="GEMINI")throw new ConflictError("A pesquisa com fontes requer Gemini configurado em Configurações → IA. O mapa de pesquisa continua disponível com os outros provedores.");
 const key=await officeProviderKey(ctx.organizationId)??process.env.GEMINI_API_KEY?.trim();if(!key)throw new ConflictError("Configure a chave do Gemini.");
 const model=settings.model||DEFAULT_MODELS.GEMINI;let result;
 try{result=await groundedSearch(key,model,question);}catch(e){if(e instanceof AiProviderError)throw new ConflictError(e.message);throw e;}
 await db.aiUsage.create({data:{organizationId:ctx.organizationId,userId:ctx.userId,feature:"juris_search",provider:"gemini",model,inputTokens:result.inputTokens,outputTokens:result.outputTokens}});
 await audit({action:"ai.juris_search",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"research",metadata:{sources:result.sources.length,passages:result.passages.length},meta:ctx.meta});
 return {...result,consultedAt:new Date().toISOString(),warning:"Fontes recuperadas pela pesquisa Google/Gemini. Trechos são síntese da IA, não transcrição de ementa. Links podem redirecionar pelo Google; confira tribunal, número, data, inteiro teor e aplicabilidade antes de citar. Disponibilidade e conteúdo da página não foram verificados separadamente pelo LegalOS."};
}
