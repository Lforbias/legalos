"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parse, runAction } from "@/server/action-helpers";
import { uuidSchema } from "@/lib/validation/common";
import { createPersonalPjeKey, revokePersonalPjeKey } from "@/server/services/apikey.service";
import { requireTenant } from "@/server/session";
import { saveCourtOtp, revealCourtOtp, revokeCourtOtp } from "@/server/services/court-otp.service";
import { ignorePjeDiscovery, linkPjeDiscovery, receivePjeDiscoveries } from "@/server/services/pje-discovery.service";
const touch = () => revalidatePath("/integracoes/pje");
export async function saveOtpAction(input: unknown) { return runAction(async () => { const { ctx } = await requireTenant(); const res = await saveCourtOtp(ctx, input); touch(); return res; }); }
export async function revealOtpAction(id: string, code: string) { return runAction(async () => { const { ctx } = await requireTenant(); return revealCourtOtp(ctx, parse(uuidSchema, id), parse(z.string().max(30), code)); }); }
export async function revokeOtpAction(id: string, code: string) { return runAction(async () => { const { ctx } = await requireTenant(); await revokeCourtOtp(ctx, parse(uuidSchema, id), parse(z.string().max(30), code)); touch(); return undefined; }); }
export async function receiveDiscoveryAction(input: unknown) { return runAction(async () => { const { ctx } = await requireTenant(); const res = await receivePjeDiscoveries(ctx, input); touch(); return res; }); }
export async function ignoreDiscoveryAction(id: string) { return runAction(async () => { const { ctx } = await requireTenant(); await ignorePjeDiscovery(ctx, parse(uuidSchema, id)); touch(); return undefined; }); }
export async function linkDiscoveryAction(input: unknown) { return runAction(async () => { const { ctx } = await requireTenant(); const res = await linkPjeDiscovery(ctx, input); touch(); revalidatePath("/processos"); revalidatePath("/area-de-trabalho", "layout"); revalidatePath(`/processos/${res.caseId}`); return res; }); }

export async function createBridgeKeyAction() { return runAction(async () => { const { ctx } = await requireTenant(); const res = await createPersonalPjeKey(ctx); touch(); return res; }); }
export async function revokeBridgeKeyAction(id: string) { return runAction(async () => { const { ctx } = await requireTenant(); await revokePersonalPjeKey(ctx, parse(uuidSchema, id)); touch(); return undefined; }); }
