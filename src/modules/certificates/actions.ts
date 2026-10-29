"use server";
import { testCertificateTls, restrictCertificateToConsultation, enableCertificateSigning, setCertificateSigner } from "@/server/services/certificate.service";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { authorizeCertificateUser, revokeCertificate, unauthorizeCertificateUser } from "@/server/services/certificate.service";
import { requireTenant } from "@/server/session";

export async function revokeCertificateAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await revokeCertificate(ctx, parse(uuidSchema, id));
    revalidatePath("/certificados");
    return undefined;
  });
}

export async function authorizeCertificateUserAction(certificateId: string, userId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await authorizeCertificateUser(ctx, parse(uuidSchema, certificateId), parse(uuidSchema, userId));
    revalidatePath("/certificados");
    return undefined;
  });
}

export async function unauthorizeCertificateUserAction(certificateId: string, userId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await unauthorizeCertificateUser(ctx, parse(uuidSchema, certificateId), parse(uuidSchema, userId));
    revalidatePath("/certificados");
    return undefined;
  });
}

export async function restrictCertificateAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await restrictCertificateToConsultation(ctx, parse(uuidSchema, id)); revalidatePath("/certificados"); return undefined; });
}

export async function enableCertificateSigningAction(id: string, confirm: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await enableCertificateSigning(ctx, parse(uuidSchema, id), String(confirm ?? "").slice(0, 200)); revalidatePath("/certificados"); return undefined; });
}

export async function setCertificateSignerAction(certificateId: string, userId: string, canSign: boolean): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await setCertificateSigner(ctx, parse(uuidSchema, certificateId), parse(uuidSchema, userId), canSign === true); revalidatePath("/certificados"); return undefined; });
}

export async function testCertificateTlsAction(id: string) {
  return runAction(async () => { const { ctx } = await requireTenant(); return testCertificateTls(ctx, parse(uuidSchema, id)); });
}
