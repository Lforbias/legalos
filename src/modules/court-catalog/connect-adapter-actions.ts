"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parse, runAction } from "@/server/action-helpers";
import { uuidSchema } from "@/lib/validation/common";
import { requireTenant } from "@/server/session";
import { assertCan } from "@/server/context";
import { ValidationError } from "@/lib/permissions/check";
import { EVOLUTION_PJE_TARGET_KEY } from "@/lib/evolution-judicial-login";
import {
  connectPje,
  connectEprocTjmg,
  deletePortalAccess,
  setPortalAccessEnabled,
  testPortalAccess,
} from "@/server/services/portal-access.service";

const touch = () => revalidatePath("/evolution/juridico/fontes");

const connectSchema = z.object({
  adapterKey: z.string().min(1).max(60),
  courtCode: z.string().min(2).max(20),
  degree: z.enum(["1", "2"]),
  document: z.string().trim().max(30).optional(),
  password: z.string().max(200).optional(),
  certificateId: z.uuid(),
  otp: z.string().trim().max(2048).optional(),
}).strict();

export type ConnectAdapterInput = z.infer<typeof connectSchema>;

/**
 * Encaminha somente os logins PJe legado e eproc do TJMG ao piloto da Evolution.
 */
export async function connectAdapterAction(raw: unknown) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    const input = connectSchema.parse(raw);
    if (!input.otp) throw new ValidationError("Informe a chave do autenticador.", { otp: ["A chave do autenticador é obrigatória."] });
    if (input.courtCode !== "TJMG" || input.degree !== "1" || !["pje-portal", "eproc-portal"].includes(input.adapterKey)) {
      throw new ValidationError("Somente os logins TJMG · 1º grau (PJe legado e eproc) estão disponíveis.", { courtCode: ["Este destino ainda não foi homologado."] });
    }

    if (input.adapterKey === "eproc-portal") {
      const { id, jobId } = await connectEprocTjmg(ctx, { username: input.document, password: input.password, certificateId: input.certificateId, otp: input.otp });
      touch();
      return { id, jobId };
    }

    const { ids, jobId } = await connectPje(ctx, {
      targets: [EVOLUTION_PJE_TARGET_KEY],
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
