import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { LOGO_MAX_BYTES, sniffImage, type LetterheadData } from "@/lib/templates/letterhead";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/** 3.0-F3 — timbrados do escritório. Ler: documents:read. Criar/editar: templates:manage. */

export type LetterheadInput = {
  name: string;
  headerText?: string | null;
  footerText?: string | null;
  /** Logo em base64 (PNG/JPEG até 300 KB). `undefined` mantém o atual; `null` remove. */
  logoBase64?: string | null;
  showPageNumbers?: boolean;
  isDefault?: boolean;
  active?: boolean;
};

function decodeLogo(b64: string): { bytes: Buffer; mime: "image/png" | "image/jpeg" } {
  const bytes = Buffer.from(b64.replace(/^data:[^,]*,/, ""), "base64");
  if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) throw new ValidationError("Logo inválido.", { logo: [`Envie uma imagem PNG ou JPEG de até ${Math.round(LOGO_MAX_BYTES / 1024)} KB.`] });
  const mime = sniffImage(bytes);
  if (!mime) throw new ValidationError("Logo inválido.", { logo: ["Use uma imagem PNG ou JPEG."] });
  return { bytes, mime };
}

function clean(i: LetterheadInput) {
  const name = i.name.trim();
  if (name.length < 2 || name.length > 80) throw new ValidationError("Nome inválido.", { name: ["Informe um nome de 2 a 80 caracteres."] });
  const headerText = i.headerText?.replace(/\r\n/g, "\n").trim() || null;
  const footerText = i.footerText?.replace(/\r\n/g, "\n").trim() || null;
  if ((headerText?.length ?? 0) > 600) throw new ValidationError("Cabeçalho longo demais.", { headerText: ["Máximo de 600 caracteres."] });
  if ((footerText?.length ?? 0) > 600) throw new ValidationError("Rodapé longo demais.", { footerText: ["Máximo de 600 caracteres."] });
  if ((headerText?.split("\n").length ?? 0) > 6 || (footerText?.split("\n").length ?? 0) > 6) throw new ValidationError("Linhas demais.", { headerText: ["Use no máximo 6 linhas no cabeçalho e 6 no rodapé."] });
  return { name, headerText, footerText };
}

const LIST_SELECT = { id: true, name: true, headerText: true, footerText: true, logoMime: true, showPageNumbers: true, isDefault: true, active: true, updatedAt: true } as const;

export async function listLetterheads(ctx: TenantContext, opts: { onlyActive?: boolean } = {}) {
  assertCan(ctx, "documents:read");
  return db.letterhead.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, ...(opts.onlyActive ? { active: true } : {}) },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    take: 50,
    select: LIST_SELECT,
  });
}

export async function createLetterhead(ctx: TenantContext, raw: LetterheadInput) {
  assertCan(ctx, "templates:manage");
  const c = clean(raw);
  const logo = raw.logoBase64 ? decodeLogo(raw.logoBase64) : null;
  if ((await db.letterhead.count({ where: { organizationId: ctx.organizationId, deletedAt: null } })) >= 20) throw new ValidationError("Limite de 20 timbrados atingido.");
  const row = await db.$transaction(async (tx) => {
    if (raw.isDefault) await tx.letterhead.updateMany({ where: { organizationId: ctx.organizationId, isDefault: true }, data: { isDefault: false } });
    const r = await tx.letterhead.create({
      data: { organizationId: ctx.organizationId, createdById: ctx.userId, ...c, logo: logo ? new Uint8Array(logo.bytes) : null, logoMime: logo?.mime ?? null, showPageNumbers: raw.showPageNumbers ?? true, isDefault: raw.isDefault ?? false, active: raw.isDefault ? true : (raw.active ?? true) },
      select: { id: true },
    });
    await audit({ action: "letterhead.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "letterhead", resourceId: r.id, meta: ctx.meta }, tx);
    return r;
  });
  return row;
}

export async function updateLetterhead(ctx: TenantContext, id: string, raw: LetterheadInput) {
  assertCan(ctx, "templates:manage");
  const c = clean(raw);
  const existing = await db.letterhead.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Timbrado não encontrado.");
  const logo = raw.logoBase64 ? decodeLogo(raw.logoBase64) : null;
  if (raw.isDefault && raw.active === false) throw new ConflictError("O timbrado padrão não pode ser desativado. Escolha outro como padrão primeiro.");
  await db.$transaction(async (tx) => {
    if (raw.isDefault) await tx.letterhead.updateMany({ where: { organizationId: ctx.organizationId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
    await tx.letterhead.update({
      where: { id },
      data: {
        ...c,
        ...(raw.logoBase64 === null ? { logo: null, logoMime: null } : logo ? { logo: new Uint8Array(logo.bytes), logoMime: logo.mime } : {}),
        ...(raw.showPageNumbers !== undefined ? { showPageNumbers: raw.showPageNumbers } : {}),
        ...(raw.isDefault !== undefined ? { isDefault: raw.isDefault } : {}),
        ...(raw.active !== undefined ? { active: raw.active } : {}),
      },
    });
    await audit({ action: "letterhead.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "letterhead", resourceId: id, meta: ctx.meta }, tx);
  });
}

export async function deleteLetterhead(ctx: TenantContext, id: string) {
  assertCan(ctx, "templates:manage");
  const existing = await db.letterhead.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, select: { isDefault: true } });
  if (!existing) throw new NotFoundError("Timbrado não encontrado.");
  await db.letterhead.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
  await audit({ action: "letterhead.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "letterhead", resourceId: id, meta: ctx.meta });
}

export async function getLogo(ctx: TenantContext, id: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  assertCan(ctx, "documents:read");
  const r = await db.letterhead.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, select: { logo: true, logoMime: true } });
  if (!r) throw new NotFoundError("Timbrado não encontrado.");
  return r.logo && r.logoMime ? { bytes: new Uint8Array(r.logo), mime: r.logoMime } : null;
}

/**
 * Resolve o timbrado a usar: `letterheadId` explícito; `"none"` = sem timbrado; vazio/undefined = o padrão ativo (se houver).
 * Timbrado de outro escritório, excluído ou desativado é recusado.
 */
export async function resolveLetterhead(ctx: TenantContext, letterheadId?: string | null): Promise<LetterheadData | null> {
  if (letterheadId === "none") return null;
  const where = letterheadId
    ? { id: letterheadId, organizationId: ctx.organizationId, deletedAt: null }
    : { organizationId: ctx.organizationId, deletedAt: null, isDefault: true, active: true };
  const r = await db.letterhead.findFirst({ where, select: { headerText: true, footerText: true, logo: true, logoMime: true, showPageNumbers: true, active: true } });
  if (letterheadId && (!r || !r.active)) throw new NotFoundError("Timbrado não encontrado.");
  if (!r) return null;
  return {
    headerText: r.headerText,
    footerText: r.footerText,
    logo: r.logo ? new Uint8Array(r.logo) : null,
    logoMime: (r.logoMime as "image/png" | "image/jpeg" | null) ?? null,
    showPageNumbers: r.showPageNumbers,
  };
}
