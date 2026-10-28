"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parse, runAction } from "@/server/action-helpers";
import { uuidSchema } from "@/lib/validation/common";
import { requireTenant } from "@/server/session";
import { connectPje, deletePortalAccess, setPortalAccessEnabled, testPortalAccess } from "@/server/services/portal-access.service";

const touch = () => revalidatePath("/integracoes/pje");

export async function connectPjeAction(input: unknown) {
  return runAction(async () => { const { ctx } = await requireTenant(); const res = await connectPje(ctx, input); touch(); return { count: res.ids.length }; });
}
export async function testPortalAccessAction(id: string) {
  return runAction(async () => { const { ctx } = await requireTenant(); await testPortalAccess(ctx, parse(uuidSchema, id)); touch(); return undefined; });
}
export async function setPortalAccessEnabledAction(id: string, enabled: boolean) {
  return runAction(async () => { const { ctx } = await requireTenant(); await setPortalAccessEnabled(ctx, parse(uuidSchema, id), parse(z.boolean(), enabled)); touch(); return undefined; });
}
export async function deletePortalAccessAction(id: string) {
  return runAction(async () => { const { ctx } = await requireTenant(); await deletePortalAccess(ctx, parse(uuidSchema, id)); touch(); return undefined; });
}
