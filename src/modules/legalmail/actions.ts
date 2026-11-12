"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { encryptSecret, mfaKey } from "@/lib/security/totp";
import { runAction } from "@/server/action-helpers";
import { canImportLegalMail, legalMailOfficeId } from "@/server/legalmail-access";
import { requirePlatform } from "@/server/platform";
import { requireTenant } from "@/server/session";
import { syncLegalMailHistory } from "@/server/services/legalmail-history.service";
import { createApiKey } from "@/server/services/apikey.service";
import { audit } from "@/server/services/audit.service";

export async function enableLegalMailOffice(officeId: string) {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    const id = z.uuid().parse(officeId);
    if (process.env.LEGALMAIL_ORGANIZATION_ID?.trim()) {
      throw new ConflictError("O escritório do LegalMail é definido no servidor.");
    }
    await db.$transaction(async (tx) => {
      const office = await tx.organization.findFirst({
        where: { id, deletedAt: null, suspendedAt: null },
        select: { id: true },
      });
      if (!office) throw new NotFoundError("Escritório ativo não encontrado.");
      const inserted = await tx.$executeRaw`
        INSERT INTO legalmail_pilot (organization_id) VALUES (${id}::uuid)
        ON CONFLICT (singleton) DO NOTHING
      `;
      if (inserted === 0) throw new ConflictError("Já existe um escritório selecionado para o LegalMail.");
      await audit({ action: "legalmail.pilot_enabled", organizationId: id, userId: pc.userId, meta: pc.meta }, tx);
    });
    revalidatePath("/admin/escritorios");
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function saveLegalMailApiKey(input: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    if (!(await canImportLegalMail(ctx))) throw new ForbiddenError();
    const key = z.string().trim().min(10).max(500).parse(input);
    const vault = mfaKey();
    if (!vault) throw new ConflictError("O cofre de credenciais precisa ser configurado para salvar a chave.");

    const url = new URL("https://api.legalmail.com.br/api/v1/balance");
    url.searchParams.set("api_key", key);
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!response) throw new ConflictError("Não foi possível consultar o LegalMail. Tente novamente.");
    if (!response.ok) {
      if ([400, 401, 403, 404].includes(response.status)) throw new ConflictError("O LegalMail recusou a chave de API.");
      throw new ConflictError("A API do LegalMail não conseguiu validar a chave agora.");
    }
    const balance = await response.json().catch(() => null);
    if (balance?.status !== "success" || typeof balance.saldo_disponivel !== "number") {
      throw new ConflictError("O LegalMail retornou uma resposta de validação inválida.");
    }

    await db.$transaction(async (tx) => {
      if (ctx.organizationId !== await legalMailOfficeId()) throw new ForbiddenError();
      const updated = await tx.$executeRaw`
        INSERT INTO legalmail_pilot (organization_id, api_key_enc)
        VALUES (${ctx.organizationId}::uuid, ${encryptSecret(key, vault)})
        ON CONFLICT (singleton) DO UPDATE SET api_key_enc = EXCLUDED.api_key_enc
        WHERE legalmail_pilot.organization_id = EXCLUDED.organization_id
      `;
      if (updated === 0) throw new ConflictError("A chave pertence a uma configuração de outro escritório.");
      await audit({ action: "legalmail.api_key_saved", organizationId: ctx.organizationId, userId: ctx.userId, meta: ctx.meta }, tx);
    });
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function createLegalMailWebhookKey() {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const key = await createApiKey(ctx, {
      name: "LegalMail · piloto",
      scopes: ["legalmail:ingest"],
      expiresInDays: 1,
    });
    revalidatePath("/integracoes");
    return { token: key.token };
  });
}

export async function syncLegalMailHistoryAction(input: string, selected?: number) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const caseId = z.uuid().parse(input);
    const providerId = z.number().int().positive().optional().parse(selected);
    const result = await syncLegalMailHistory(ctx, caseId, undefined, providerId);
    revalidatePath(`/processos/${caseId}`);
    return result;
  });
}
