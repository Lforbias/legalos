import { beforeAll, afterAll, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { totpCode, totpStep } from "@/lib/security/totp";
import { startEnrollment, confirmEnrollment } from "@/server/services/mfa.service";
import { listCommercialProspects, getCommercialProspect, updateCommercialProspect } from "@/server/services/prospecting.service";
import { ConflictError, ForbiddenError } from "@/lib/permissions/check";
import { META, makeUser } from "./helpers";
import type { PlatformCtx } from "@/server/services/platform.service";
import { prospectEditSchema, type ProspectEdit } from "@/modules/prospecting/schema";
let pc: PlatformCtx, outsider: PlatformCtx;
const cnpj = '00000000000100';
beforeAll(async () => {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  const user = await makeUser('prospect-admin');
  const mfa = await startEnrollment(user.id, user.email);
  await confirmEnrollment(user.id, totpCode(mfa.secret, totpStep()), META);
  await db.platformAdmin.create({ data: { userId: user.id } });
  pc = { userId: user.id, meta: META };
  outsider = { userId: (await makeUser('prospect-stranger')).id, meta: META };
  await db.commercialProspect.create({ data: { cnpj, legalName: 'Escritório fictício de teste de prospecção', address: 'Endereço fictício', cnae: '6911701', sourceMonth: '2026-10', neighborhood: 'Bairro teste' } });
});
afterAll(async () => { await db.commercialProspect.deleteMany({ where: { cnpj } }); });
const edit = (): ProspectEdit => ({ cnpj, version: 0, stage: 'QUALIFIED', doNotContact: true, contactVerified: false, notes: 'Não abordar', nextContactOn: null, latitude: null, longitude: null, locationAccuracy: null });
it('nega leitura e alteração a usuários fora da administração', async () => {
  await expect(listCommercialProspects(outsider, {})).rejects.toBeInstanceOf(ForbiddenError);
  await expect(getCommercialProspect(outsider, cnpj)).rejects.toBeInstanceOf(ForbiddenError);
  await expect(updateCommercialProspect(outsider, edit())).rejects.toBeInstanceOf(ForbiddenError);
});
it('persiste bloqueio, filtra a lista e impede sobrescrita concorrente', async () => {
  await updateCommercialProspect(pc, edit());
  expect((await getCommercialProspect(pc, cnpj))?.doNotContact).toBe(true);
  expect((await listCommercialProspects(pc, { q: cnpj, blocked: 'yes', location: 'pending' })).total).toBe(1);
  expect((await listCommercialProspects(pc, { q: cnpj, blocked: 'no' })).total).toBe(0);
  await expect(updateCommercialProspect(pc, edit())).rejects.toBeInstanceOf(ConflictError);
  expect(await db.auditLog.count({ where: { action: 'platform.prospect.updated', resourceId: cnpj } })).toBeGreaterThan(0);
});
it('rejeita retorno para não contatar, data inválida e coordenadas incompletas ou externas', () => {
  expect(prospectEditSchema.safeParse({ ...edit(), nextContactOn: '2026-10-28' }).success).toBe(false);
  expect(prospectEditSchema.safeParse({ ...edit(), doNotContact: false, nextContactOn: '2026-02-30' }).success).toBe(false);
  expect(prospectEditSchema.safeParse({ ...edit(), latitude: -23.5 }).success).toBe(false);
  expect(prospectEditSchema.safeParse({ ...edit(), latitude: 40, longitude: -46.6, locationAccuracy: 'ADDRESS' }).success).toBe(false);
});
