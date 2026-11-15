"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parse, runAction } from "@/server/action-helpers";
import { uuidSchema } from "@/lib/validation/common";
import { requireTenant } from "@/server/session";
import { assertCan } from "@/server/context";
import { ValidationError } from "@/lib/permissions/check";
import {
  connectPje,
  connectEprocPortal,
  deletePortalAccess,
  setPortalAccessEnabled,
  testPortalAccess,
  isRegionalPjeTarget,
} from "@/server/services/portal-access.service";
import { getPjeTarget } from "@/lib/robots/pje/targets";
import { getEprocPortalTarget } from "@/lib/robots/eproc/targets";

const touch = () => revalidatePath("/evolution/juridico/fontes");

const connectSchema = z.object({
  adapterKey: z.string().min(1).max(60),
  courtCode: z.string().min(2).max(20),
  degree: z.enum(["1", "2"]),
  targetKey: z.string().min(3).max(40),
  document: z.string().trim().max(30).optional(),
  password: z.string().max(200).optional(),
  certificateId: z.uuid(),
  otp: z.string().trim().max(2048).optional(),
}).strict();

export type ConnectAdapterInput = z.infer<typeof connectSchema>;

/**
 * Encaminha os logins PJe/eproc autorizados dentro do recorte regional.
 */
export async function connectAdapterAction(raw: unknown) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    const input = connectSchema.parse(raw);
    if (!input.otp) throw new ValidationError("Informe a chave do autenticador.", { otp: ["A chave do autenticador é obrigatória."] });
    if (input.adapterKey === "eproc-portal") {
      const target = getEprocPortalTarget(input.targetKey);
      if (!target || target.courtCode !== input.courtCode || target.degree !== input.degree) throw new ValidationError("Destino eproc inválido.", { targetKey: ["Escolha um destino da lista."] });
      const { id, jobId } = await connectEprocPortal(ctx, { targetKey: target.key, username: input.document, password: input.password, certificateId: input.certificateId, otp: input.otp });
      touch();
      return { id, jobId };
    }

    if (input.adapterKey !== "pje-portal") throw new ValidationError("Conector de tribunal inválido.");
    const target = getPjeTarget(input.targetKey);
    if (target?.key !== `${input.courtCode.toLowerCase()}-${input.degree}g`) throw new ValidationError("Destino PJe inválido.", { targetKey: ["Escolha um destino da lista."] });
    if (!target || !isRegionalPjeTarget(target)) throw new ValidationError("Este destino ainda não está disponível para autenticação.", { courtCode: ["O destino não está na Justiça Estadual, Federal ou do Trabalho do Sul e Sudeste."] });

    const { ids, jobId } = await connectPje(ctx, {
      targets: [target.key],
      document: input.document,
      password: input.password,
      certificateId: input.certificateId,
      otp: input.otp,
    }, "evolution");

    touch();
    return { id: ids[0]!, jobId };
  });
}

const surfaceSchema = z.enum(["evolution", "evolution-eproc"]);

export async function uploadPortalCertificateAction(formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    const file = formData.get("file");
    const password = formData.get("password");
    const label = formData.get("label");
    if (!(file instanceof File) || typeof password !== "string" || typeof label !== "string") {
      throw new ValidationError("Selecione o certificado A1 e informe a senha do arquivo.");
    }
    if (!file.size || file.size > 100_000) throw new ValidationError("O arquivo deve ter até 100 KB.");
    const { uploadCertificate } = await import("@/server/services/certificate.service");
    await uploadCertificate(ctx, { file: Buffer.from(await file.arrayBuffer()), password, label, ownerUserId: ctx.userId }, "portal");
    touch();
    return undefined;
  });
}

export async function testConnectionAction(id: string, rawSurface: unknown = "evolution") {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    const { jobId } = await testPortalAccess(ctx, parse(uuidSchema, id), parse(surfaceSchema, rawSurface));
    touch();
    return { jobId };
  });
}

export async function toggleConnectionAction(id: string, enabled: boolean, rawSurface: unknown = "evolution") {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    await setPortalAccessEnabled(ctx, parse(uuidSchema, id), parse(z.boolean(), enabled), parse(surfaceSchema, rawSurface));
    touch();
    return undefined;
  });
}

export async function deleteConnectionAction(id: string, rawSurface: unknown = "evolution") {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    await deletePortalAccess(ctx, parse(uuidSchema, id), parse(surfaceSchema, rawSurface));
    touch();
    return undefined;
  });
}
