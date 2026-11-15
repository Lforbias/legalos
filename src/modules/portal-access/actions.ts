"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parse, runAction } from "@/server/action-helpers";
import { uuidSchema } from "@/lib/validation/common";
import { requireTenant } from "@/server/session";
import { connectPje, deletePortalAccess, setPortalAccessEnabled, testPortalAccess, type PortalAccessSurface } from "@/server/services/portal-access.service";

const touch = (surface: PortalAccessSurface = "legacy") => revalidatePath(surface === "evolution" ? "/evolution/controladoria/fontes/login" : "/integracoes/pje");

export async function connectPjeAction(input: unknown, surface: PortalAccessSurface = "legacy") {
  return runAction(async () => { const { ctx } = await requireTenant(); const res = await connectPje(ctx, input, surface); touch(surface); return { count: res.ids.length }; });
}
export async function testPortalAccessAction(id: string, surface: PortalAccessSurface = "legacy") {
  return runAction(async () => { const { ctx } = await requireTenant(); await testPortalAccess(ctx, parse(uuidSchema, id), surface); touch(surface); return undefined; });
}
export async function setPortalAccessEnabledAction(id: string, enabled: boolean, surface: PortalAccessSurface = "legacy") {
  return runAction(async () => { const { ctx } = await requireTenant(); await setPortalAccessEnabled(ctx, parse(uuidSchema, id), parse(z.boolean(), enabled), surface); touch(surface); return undefined; });
}
export async function deletePortalAccessAction(id: string, surface: PortalAccessSurface = "legacy") {
  return runAction(async () => { const { ctx } = await requireTenant(); await deletePortalAccess(ctx, parse(uuidSchema, id), surface); touch(surface); return undefined; });
}
