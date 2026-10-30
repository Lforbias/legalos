"use server";
import { testCertificateTls, restrictCertificateToConsultation, enableCertificateSigning, setCertificateSigner } from "@/server/services/certificate.service";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { authorizeCertificateUser, revokeCertificate, unauthorizeCertificateUser } from "@/server/services/certificate.service";
import { requireTenant } from "@/server/session";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { MAX_PFX_BYTES, uploadCertificate } from "@/server/services/certificate.service";

async function requireBoxV3Tenant() {
  if (!boxV3PreviewEnabled()) throw new NotFoundError("Configurações do Box 3.0 indisponíveis.");
  return requireTenant();
}

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

export async function uploadBoxV3CertificateAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    const file = formData.get("file");
    const password = formData.get("password");
    const label = formData.get("label");
    const ownerUserId = formData.get("ownerUserId");
    if (!(file instanceof File) || typeof password !== "string" || typeof label !== "string" || typeof ownerUserId !== "string") throw new ValidationError("Confira o arquivo e os campos do certificado.");
    if (!file.size || file.size > MAX_PFX_BYTES) throw new ValidationError("O arquivo deve ter até 100 KB.");
    await uploadCertificate(ctx, { file: Buffer.from(await file.arrayBuffer()), password, label, ownerUserId: parse(uuidSchema, ownerUserId) }, "v3");
    revalidatePath("/box-v3/configuracoes");
    return undefined;
  });
}

export async function revokeBoxV3CertificateAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    await revokeCertificate(ctx, parse(uuidSchema, id), "v3");
    revalidatePath("/box-v3/configuracoes");
    return undefined;
  });
}

export async function authorizeBoxV3CertificateUserAction(certificateId: string, userId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    await authorizeCertificateUser(ctx, parse(uuidSchema, certificateId), parse(uuidSchema, userId), "v3");
    revalidatePath("/box-v3/configuracoes");
    return undefined;
  });
}

export async function unauthorizeBoxV3CertificateUserAction(certificateId: string, userId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    await unauthorizeCertificateUser(ctx, parse(uuidSchema, certificateId), parse(uuidSchema, userId), "v3");
    revalidatePath("/box-v3/configuracoes");
    return undefined;
  });
}
