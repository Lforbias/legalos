"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { boxV2Enabled } from "@/lib/features";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { assertCan } from "@/server/context";
import { acknowledgeAlert, runHealthCheck } from "@/server/judicial/health.service";
import { recordNoticeViewed } from "@/server/judicial/inbox-v2.service";
import { addProfessional } from "@/server/judicial/professional.service";
import { checkSource, startPublicMonitoring, type CheckOutcome } from "@/server/judicial/onboarding.service";
import { setMonitorEnabled } from "@/server/services/djen.service";
import { setConnectionEnabled } from "@/server/services/mni.service";
import { setPortalAccessEnabled } from "@/server/services/portal-access.service";
import { requireTenant } from "@/server/session";

const SOURCE_KINDS = ["DJEN", "MNI", "PORTAL"] as const;
const kindSchema = z.enum(SOURCE_KINDS);

/** As telas novas só existem com a chave ligada; as ações respeitam a mesma regra. */
function assertBoxV2(organizationId: string) {
  if (!boxV2Enabled(organizationId)) throw new NotFoundError("Recurso indisponível.");
}

const touch = () => {
  for (const p of ["/box", "/box/conexoes", "/box/saude", "/box/configurar", "/box/configuracoes", "/caixa-de-entrada"]) revalidatePath(p);
};

/** Consulta real e imediata de uma fonte. O resultado é o que a fonte respondeu, nunca uma simulação. */
export async function checkSourceAction(kindInput: string, idInput: string): Promise<ActionState<CheckOutcome>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertBoxV2(ctx.organizationId);
    const out = await checkSource(ctx, parse(kindSchema, kindInput), parse(uuidSchema, idInput));
    touch();
    return out;
  });
}

export async function setSourceEnabledAction(kindInput: string, idInput: string, enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertBoxV2(ctx.organizationId);
    const kind = parse(kindSchema, kindInput);
    const id = parse(uuidSchema, idInput);
    const on = parse(z.boolean(), enabled);
    if (kind === "DJEN") await setMonitorEnabled(ctx, id, on);
    else if (kind === "MNI") await setConnectionEnabled(ctx, id, on);
    else await setPortalAccessEnabled(ctx, id, on);
    touch();
    return undefined;
  });
}

export async function acknowledgeAlertAction(idInput: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertBoxV2(ctx.organizationId);
    await acknowledgeAlert(ctx, parse(uuidSchema, idInput));
    touch();
    return undefined;
  });
}

/** "Reavaliar agora": recalcula os alertas do escritório sem esperar o agendador (5 em 5 minutos). */
export async function recheckHealthAction(): Promise<ActionState<{ opened: number; resolved: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertBoxV2(ctx.organizationId);
    assertCan(ctx, "integrations:manage");
    const r = await runHealthCheck(ctx.organizationId);
    touch();
    return { opened: r.opened + r.escalated, resolved: r.resolved };
  });
}

const professionalSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do advogado.").max(120),
  oabNumber: z.string().trim().min(1, "Informe o número da OAB."),
  oabUf: z.string().trim().length(2, "Selecione a seccional (UF)."),
  notifyEmail: z.string().trim().max(254).optional().or(z.literal("")),
});

export async function addProfessionalAction(input: z.input<typeof professionalSchema>): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertBoxV2(ctx.organizationId);
    const v = parse(professionalSchema, input);
    const r = await addProfessional(ctx, { name: v.name, oabNumber: v.oabNumber, oabUf: v.oabUf, notifyEmail: v.notifyEmail || null });
    touch();
    return { id: r.id };
  });
}

/** Passo B do assistente: liga o monitoramento público (DJEN) do profissional e faz uma consulta real na hora. */
export async function startPublicMonitoringAction(professionalIdInput: string): Promise<ActionState<CheckOutcome>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertBoxV2(ctx.organizationId);
    const out = await startPublicMonitoring(ctx, parse(uuidSchema, professionalIdInput));
    touch();
    return out;
  });
}

/**
 * Registra que a comunicação foi aberta NO LEGALOS. Só um fato interno (primeira vista + histórico):
 * não consulta nem avisa o tribunal e nunca registra ciência oficial.
 */
export async function recordNoticeViewedAction(noticeIdInput: string): Promise<ActionState<{ firstView: boolean }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertBoxV2(ctx.organizationId);
    const r = await recordNoticeViewed(ctx, parse(uuidSchema, noticeIdInput));
    return { firstView: r.firstView };
  });
}
