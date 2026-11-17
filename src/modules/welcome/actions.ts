"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { ActionState } from "@/lib/validation/common";
import { ValidationError } from "@/lib/permissions/check";
import { limiters } from "@/lib/security/rate-limit";
import { parse, runAction } from "@/server/action-helpers";
import { getRequestMeta, requireSession, requireTenant } from "@/server/session";
import { createOrganization } from "@/server/services/organization.service";
import { setActiveOrganization } from "@/server/services/auth.service";
import { db } from "@/lib/db/client";
import { welcomeDraftSchema, welcomeOrganizationSchema } from "./schemas";
import { getReservedGiftCode, previewGiftCode, releaseGiftCodeReservation, reserveGiftCode } from "@/server/services/gift-code.service";
import { LEGALOS_PLANS } from "@/config/pricing";
import { billingConfig } from "@/server/services/billing.service";
import { dismissWelcomeActivationChecklist } from "@/server/services/welcome-onboarding.service";

export async function saveWelcomeProgressAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession();
    const draft = parse(welcomeDraftSchema, input);
    const existing = await db.welcomeOnboarding.findUnique({ where: { userId: session.user.id }, select: { completedAt: true } });
    if (existing?.completedAt) return undefined;

    await db.welcomeOnboarding.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        currentStep: draft.currentStep,
        data: draft.data as Prisma.InputJsonValue,
      },
      update: {
        currentStep: draft.currentStep,
        data: draft.data as Prisma.InputJsonValue,
      },
    });
    return undefined;
  });
}

export async function completeWelcomeOrganizationAction(input: unknown): Promise<ActionState<{ redirectTo: string }>> {
  return runAction(async () => {
    const session = await requireSession();
    if (!session.user.emailVerifiedAt) throw new ValidationError("Confirme seu e-mail antes de criar o escritório.");
    const data = parse(welcomeOrganizationSchema, input);
    const reservedGift = await getReservedGiftCode(session.user.id);
    if (data.activationPath === "GIFT" && !reservedGift?.alreadyReserved) {
      throw new ValidationError("Consulte e reserve um código-presente válido antes de escolher esse caminho.");
    }
    if (data.activationPath !== "GIFT" && reservedGift?.alreadyReserved) {
      throw new ValidationError("Remova a reserva do código-presente antes de escolher outro caminho.");
    }
    if (data.activationPath === "SUBSCRIPTION") {
      if (!data.planKey || !LEGALOS_PLANS.some((plan) => plan.id === data.planKey)) {
        throw new ValidationError("Escolha um plano oficial para continuar.");
      }
      if (!billingConfig().config?.sandbox) {
        throw new ValidationError("A contratação está temporariamente indisponível até a homologação do checkout em sandbox. Você pode iniciar pela avaliação gratuita.");
      }
    }
    const organization = await createOrganization(
      session.user.id,
      { name: data.name, legalName: data.legalName || null, document: data.document || null, timezone: data.timezone },
      await getRequestMeta(),
      {
        welcomeOnboarding: { profile: data.data, office: { name: data.name, legalName: data.legalName, document: data.document, timezone: data.timezone }, activationPath: data.activationPath, planKey: data.planKey ?? null, activationChecklist: { completed: [], completedAt: {}, dismissed: false } } as Prisma.InputJsonValue,
        ...(data.data.oabNumber && data.data.oabUf ? { professionalIdentity: { name: session.user.name, oabNumber: data.data.oabNumber, oabUf: data.data.oabUf, notifyEmail: session.user.email } } : {}),
      },
    );
    await setActiveOrganization(session.user.id, session.id, organization.id);
    return { redirectTo: data.activationPath === "SUBSCRIPTION" ? `/configuracoes/plano?checkout=${encodeURIComponent(data.planKey!)}` : "/dashboard" };
  });
}

export async function previewWelcomeGiftCodeAction(rawCode: string): Promise<ActionState<Awaited<ReturnType<typeof previewGiftCode>>>> {
  return runAction(async () => {
    const session = await requireSession();
    const code = parse(z.string().trim().min(1).max(50), rawCode);
    const meta = await getRequestMeta();
    if (!limiters.giftCode.check(`${meta.ipAddress ?? "?"}:${session.user.id}`)) throw new ValidationError("Muitas consultas de código. Aguarde alguns minutos e tente novamente.");
    return previewGiftCode(session.user.id, code);
  });
}

export async function reserveWelcomeGiftCodeAction(rawCode: string): Promise<ActionState<Awaited<ReturnType<typeof reserveGiftCode>>>> {
  return runAction(async () => {
    const session = await requireSession();
    if (!session.user.emailVerifiedAt) throw new ValidationError("Confirme seu e-mail antes de reservar o benefício.");
    const code = parse(z.string().trim().min(1).max(50), rawCode);
    const meta = await getRequestMeta();
    if (!limiters.giftCode.check(`${meta.ipAddress ?? "?"}:${session.user.id}`)) throw new ValidationError("Muitas consultas de código. Aguarde alguns minutos e tente novamente.");
    return reserveGiftCode(session.user.id, code);
  });
}

export async function releaseWelcomeGiftCodeAction(): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession();
    await releaseGiftCodeReservation(session.user.id);
    return undefined;
  });
}

export async function updateWelcomeActivationAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, session } = await requireTenant();
    parse(z.object({ dismissed: z.literal(true) }), input);
    await dismissWelcomeActivationChecklist(session.user.id, ctx.organizationId);
    return undefined;
  });
}
