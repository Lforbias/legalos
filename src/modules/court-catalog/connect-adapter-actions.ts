"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parse, runAction } from "@/server/action-helpers";
import { uuidSchema } from "@/lib/validation/common";
import { requireTenant } from "@/server/session";
import { db } from "@/lib/db/client";
import { certKey, sealBytes } from "@/lib/security/pfx";
import { isValidCpf, isValidCnpj, onlyDigits } from "@/lib/validation/br-documents";
import { ensureAdapters, findAdapterForCourt, getAdapter } from "@/lib/judicial/adapter-bootstrap";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan } from "@/server/context";
import { audit } from "@/server/services/audit.service";

const touch = () => revalidatePath("/evolution/juridico/fontes");

function requireKey(): Buffer {
  const k = certKey();
  if (!k) throw new ConflictError("O cofre não está configurado neste sistema (falta CERT_ENCRYPTION_KEY).");
  return k;
}

async function requireOwnMfa(userId: string) {
  const m = await db.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!m?.enabledAt) throw new ConflictError("Para guardar credenciais de tribunal, ative a verificação em duas etapas do LegalOS em Minha conta.");
}

const connectSchema = z.object({
  adapterKey: z.string().min(1).max(60),
  courtCode: z.string().min(2).max(20),
  degree: z.enum(["1", "2"]),
  document: z.string().trim().min(11).max(20),
  password: z.string().min(1, "Informe a senha.").max(200),
}).strict();

export type ConnectAdapterInput = z.infer<typeof connectSchema>;

export async function connectAdapterAction(raw: unknown) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "cases:read");
    ensureAdapters();

    const input = connectSchema.parse(raw);
    const adapter = getAdapter(input.adapterKey);
    if (!adapter) throw new ValidationError("Adaptador não encontrado.", { adapterKey: ["Adaptador inválido."] });

    const target = adapter.descriptor.supportedTargets.find(
      (t) => t.courtCode === input.courtCode && t.degree === input.degree,
    );
    if (!target) throw new ValidationError("Tribunal ou grau não suportado por este adaptador.", { courtCode: ["Tribunal não suportado."] });

    const document = onlyDigits(input.document);
    if (!(document.length === 11 ? isValidCpf(document) : document.length === 14 ? isValidCnpj(document) : false)) {
      throw new ValidationError("CPF/CNPJ inválido.", { document: ["Confira o CPF/CNPJ."] });
    }

    const key = requireKey();
    await requireOwnMfa(ctx.userId);

    const targetKey = `${input.courtCode.toLowerCase()}-${input.degree === "1" ? "1g" : "2g"}`;
    const secretEnc = sealBytes(
      Buffer.from(JSON.stringify({ document, password: input.password, otpSecret: null }), "utf8"),
      key,
    );

    const data = {
      authMethod: "PASSWORD",
      certificateId: null,
      secretEnc,
      enabled: true,
      status: "PENDING",
      statusMessage: "Aguardando o primeiro teste de conexão.",
      statusAt: new Date(),
    };

    const row = await db.portalAccess.upsert({
      where: {
        organizationId_userId_system_target: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          system: input.adapterKey,
          target: targetKey,
        },
      },
      create: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        system: input.adapterKey,
        target: targetKey,
        label: target.label,
        ...data,
      },
      update: data,
      select: { id: true },
    });

    const open = await db.robotJob.findFirst({
      where: { accessId: row.id, kind: "LOGIN_TEST", status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true },
    });
    const jobId = open?.id ?? (await db.robotJob.create({
      data: { organizationId: ctx.organizationId, accessId: row.id, kind: "LOGIN_TEST" },
      select: { id: true },
    })).id;

    await db.portalAccess.update({
      where: { id: row.id },
      data: { status: "CONNECTING", statusMessage: "Na fila para o teste de conexão.", statusAt: new Date() },
    });

    await audit({
      action: "portal_access.save",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceType: "portal_access",
      resourceId: row.id,
      metadata: { system: input.adapterKey, court: input.courtCode, degree: input.degree },
      meta: ctx.meta,
    });

    touch();
    return { id: row.id, jobId };
  });
}

export async function testConnectionAction(id: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "cases:read");
    const a = await db.portalAccess.findFirst({
      where: { id, organizationId: ctx.organizationId, userId: ctx.userId },
    });
    if (!a) throw new NotFoundError("Conexão não encontrada.");
    if (!a.enabled) throw new ConflictError("Conexão desligada. Ligue antes de testar.");

    const last = await db.robotJob.findFirst({
      where: { accessId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, summary: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < 60_000) {
      throw new ConflictError("Aguarde um minuto antes de testar novamente.");
    }

    const code = (last?.summary as { code?: string } | null)?.code;
    if (a.status === "NEEDS_ACTION" && (code === "BAD_CREDENTIALS" || code === "OTP_REJECTED")) {
      throw new ConflictError("O tribunal recusou os dados. Corrija a senha antes de testar novamente.");
    }

    const open = await db.robotJob.findFirst({
      where: { accessId: id, kind: "LOGIN_TEST", status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true },
    });
    const jobId = open?.id ?? (await db.robotJob.create({
      data: { organizationId: ctx.organizationId, accessId: id, kind: "LOGIN_TEST" },
      select: { id: true },
    })).id;

    await db.portalAccess.update({
      where: { id },
      data: { status: "CONNECTING", statusMessage: "Na fila para o teste de conexão.", statusAt: new Date() },
    });

    await audit({
      action: "portal_access.test",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceType: "portal_access",
      resourceId: id,
      meta: ctx.meta,
    });

    touch();
    return { jobId };
  });
}

export async function toggleConnectionAction(id: string, enabled: boolean) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "cases:read");
    const a = await db.portalAccess.findFirst({
      where: { id, organizationId: ctx.organizationId, userId: ctx.userId },
      select: { id: true },
    });
    if (!a) throw new NotFoundError("Conexão não encontrada.");
    await db.portalAccess.update({ where: { id }, data: { enabled } });
    await audit({
      action: enabled ? "portal_access.enable" : "portal_access.disable",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceType: "portal_access",
      resourceId: id,
      meta: ctx.meta,
    });
    touch();
    return undefined;
  });
}

export async function deleteConnectionAction(id: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "cases:read");
    const a = await db.portalAccess.findFirst({
      where: { id, organizationId: ctx.organizationId, userId: ctx.userId },
      select: { id: true },
    });
    if (!a) throw new NotFoundError("Conexão não encontrada.");
    await db.portalAccess.delete({ where: { id: a.id } });
    await audit({
      action: "portal_access.delete",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceType: "portal_access",
      resourceId: id,
      meta: ctx.meta,
    });
    touch();
    return undefined;
  });
}
