import { db } from "@/lib/db/client";
import { INTEREST_CONSENT_TEXT, INTEREST_CONSENT_VERSION, INTEREST_TAG, type InterestInput } from "@/lib/launch";
import type { RequestMeta } from "@/server/context";
import { audit } from "./audit.service";

/**
 * Lista de interesse da landing de lançamento. Cada pessoa vira um escritório no funil do LegalOS Comercial
 * (etapa Identificado, marcado com INTEREST_TAG), com o contato e o registro do aceite.
 * Quem já se cadastrou com o mesmo e-mail não é duplicado: ganha uma nova anotação no histórico.
 */
export async function registerInterest(input: InterestInput, meta: RequestMeta): Promise<{ created: boolean }> {
  const when = new Date();
  const consentNote = `Aceite registrado em ${when.toISOString()} (versão ${INTEREST_CONSENT_VERSION}): “${INTEREST_CONSENT_TEXT}”`;
  const existing = await db.comProspect.findFirst({
    where: { deletedAt: null, tags: { has: INTEREST_TAG }, OR: [{ email: input.email }, { contacts: { some: { email: input.email } } }] },
    select: { id: true, whatsapp: true },
  });

  if (existing) {
    await db.$transaction([
      db.comProspect.update({ where: { id: existing.id }, data: { whatsapp: existing.whatsapp ?? input.whatsapp } }),
      db.comActivity.create({ data: { prospectId: existing.id, kind: "NOTA", summary: `Registrou interesse de novo pela landing de lançamento (${input.name}${input.office ? `, ${input.office}` : ""}). ${consentNote}` } }),
    ]);
    await audit({ action: "comercial.interest_repeat", resourceType: "com_prospect", resourceId: existing.id, meta });
    return { created: false };
  }

  const prospect = await db.comProspect.create({
    data: {
      name: input.office ?? input.name,
      email: input.email,
      whatsapp: input.whatsapp,
      tags: [INTEREST_TAG],
      notes: `Lista de interesse do lançamento. ${consentNote}`,
      contacts: { create: { name: input.name, email: input.email, phone: input.whatsapp, isDecisionMaker: false } },
      activities: { create: { kind: "NOTA", summary: `Registrou interesse pela landing de lançamento. ${consentNote}` } },
    },
    select: { id: true },
  });
  await audit({ action: "comercial.interest_register", resourceType: "com_prospect", resourceId: prospect.id, meta });
  return { created: true };
}

/** Linhas para a planilha da lista de interesse (mais recentes primeiro). */
export async function interestRows(limit = 5_000) {
  const rows = await db.comProspect.findMany({
    where: { deletedAt: null, tags: { has: INTEREST_TAG } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { name: true, email: true, whatsapp: true, stage: true, doNotContact: true, createdAt: true, contacts: { orderBy: { createdAt: "asc" }, take: 1, select: { name: true } } },
  });
  return rows.map((r) => [r.createdAt.toISOString().slice(0, 16).replace("T", " "), r.contacts[0]?.name ?? "", r.name, r.email ?? "", r.whatsapp ?? "", r.stage, r.doNotContact ? "sim" : "não"]);
}
