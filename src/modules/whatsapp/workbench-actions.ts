"use server";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/session";
import { runAction } from "@/server/action-helpers";
import { submitMetaTemplate } from "@/server/services/chat-meta-outbound.service";
import { applyChatClassification, applyChatMacro, assistChat, chatPaymentLinks, chatContactDetails, chatPresence, listChatResources, recordChatContactEvent, removeChatResource, saveChatResource, setChatAssistEnabled, setChatBlocked } from "@/server/services/chat-workbench.service";

export async function assistChatAction(input:unknown) {return runAction(async()=>{const {ctx}=await requireTenant();return assistChat(ctx,input);});}
export async function chatPresenceAction(id:string,typing:boolean) {return runAction(async()=>{const {ctx}=await requireTenant();return chatPresence(ctx,id,typing);});}
export async function workspaceDataAction(id:string) {return runAction(async()=>{const {ctx}=await requireTenant();const [resources,contact,payments]=await Promise.all([listChatResources(ctx),chatContactDetails(ctx,id),chatPaymentLinks(ctx,id)]);return {resources,contact,payments};});}
export async function macroAction(id:string,macroId:string) {return runAction(async()=>{const {ctx}=await requireTenant();const r=await applyChatMacro(ctx,id,macroId);revalidatePath("/atendimento");return r;});}
export async function classificationAction(id:string,input:unknown) {return runAction(async()=>{const {ctx}=await requireTenant();const r=await applyChatClassification(ctx,id,input);revalidatePath("/atendimento");return r;});}
export async function blockedAction(id:string,blocked:boolean,reason:string) {return runAction(async()=>{const {ctx}=await requireTenant();await setChatBlocked(ctx,id,blocked,reason);revalidatePath("/atendimento");return {blocked};});}
export async function contactEventAction(id:string,kind:string,payload:unknown) {return runAction(async()=>{const {ctx}=await requireTenant();const r=await recordChatContactEvent(ctx,id,kind,payload);revalidatePath("/atendimento");return r;});}
export async function resourceAction(input:unknown) {return runAction(async()=>{const {ctx}=await requireTenant();await saveChatResource(ctx,input);revalidatePath("/atendimento/operacoes");revalidatePath("/atendimento");return undefined;});}
export async function removeResourceAction(id:string) {return runAction(async()=>{const {ctx}=await requireTenant();await removeChatResource(ctx,id);revalidatePath("/atendimento/operacoes");return undefined;});}
export async function assistSwitchAction(enabled:boolean) {return runAction(async()=>{const {ctx}=await requireTenant();await setChatAssistEnabled(ctx,enabled);revalidatePath("/atendimento/operacoes");return undefined;});}
export async function submitMetaTemplateAction(input:unknown) {return runAction(async()=>{const {ctx}=await requireTenant();const r=await submitMetaTemplate(ctx,input);revalidatePath("/atendimento/configuracoes");return r;});}
