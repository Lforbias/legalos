"use server";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/session";
import { runAction } from "@/server/action-helpers";
import { saveEmailAccount,setEmailEnabled,syncOfficeEmail,sendEmailReply,updateEmailConversation,assistEmailReply } from "@/server/services/chat-email.service";
const refresh=()=>{revalidatePath("/atendimento/email");revalidatePath("/atendimento/operacoes");};
export async function saveEmailAccountAction(input:unknown){return runAction(async()=>{const {ctx}=await requireTenant();await saveEmailAccount(ctx,input);refresh();return undefined;});}
export async function enableEmailAction(enabled:boolean){return runAction(async()=>{const {ctx}=await requireTenant();await setEmailEnabled(ctx,enabled);refresh();return undefined;});}
export async function syncEmailAction(){return runAction(async()=>{const {ctx}=await requireTenant();const r=await syncOfficeEmail(ctx);refresh();return r;});}
export async function sendEmailAction(id:string,input:unknown){return runAction(async()=>{const {ctx}=await requireTenant();const r=await sendEmailReply(ctx,id,input);refresh();return r;});}
export async function updateEmailAction(id:string,input:unknown){return runAction(async()=>{const {ctx}=await requireTenant();await updateEmailConversation(ctx,id,input);refresh();return undefined;});}
export async function assistEmailAction(id:string,input:unknown){return runAction(async()=>{const {ctx}=await requireTenant();return assistEmailReply(ctx,id,input);});}
