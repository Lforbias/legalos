/**
 * LegalOS Comercial (8.0): prospecção e vendas do próprio LegalOS. Espaço da PLATAFORMA, separado dos escritórios:
 *  - acesso: super-administradores ou membros ativos da equipe comercial, sempre com 2FA;
 *  - nunca lê nem grava dados de escritórios clientes (processos, clientes, documentos); só cadastros de prospecção;
 *  - consulta de CNPJ (dados públicos) e mapa (OpenStreetMap) só preenchem campos que a equipe confere e edita.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { lookupCnpj, type CnpjData } from "@/lib/comercial/cnpj";
import { geocodeAddress, sleep } from "@/lib/comercial/geocode";
import type { ImportRow } from "@/lib/comercial/import-rows";
import { findPlan, PLAN_CATALOG } from "@/lib/comercial/catalog";
import { computeQuote } from "@/lib/comercial/pricing";
import { computeProjection, monthsUntil, weightedPipelineCents, type PipelineDeal } from "@/lib/comercial/projection";
import type { ProspectInput } from "@/lib/comercial/schemas";
import { mergeStageNumbers, OPEN_STAGES, STAGE_KEYS, type StageKey } from "@/lib/comercial/stages";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { isValidCnpj, normalizeCnpj } from "@/lib/validation/br-documents";
import type { RequestMeta } from "@/server/context";
import { audit } from "./audit.service";

export type ComRole = "GERENTE" | "VENDEDOR";
export type ComCtx = { userId: string; role: ComRole; isPlatformAdmin: boolean; meta: RequestMeta };

const DAY = 86_400_000;

/** Quem entra: super-admin ativo ou membro ativo da equipe comercial, ambos com 2FA. */
export async function comAccessState(userId: string): Promise<"ok" | "no_access" | "needs_mfa"> {
  const u = await db.user.findFirst({
    where: { id: userId, disabledAt: null, OR: [{ platformAdmin: { isNot: null } }, { comMember: { is: { active: true } } }] },
    select: { mfa: { select: { enabledAt: true } } },
  });
  if (!u) return "no_access";
  return u.mfa?.enabledAt ? "ok" : "needs_mfa";
}

export async function resolveComContext(userId: string, meta: RequestMeta = {}): Promise<ComCtx | null> {
  const u = await db.user.findFirst({
    where: { id: userId, disabledAt: null, mfa: { is: { enabledAt: { not: null } } }, OR: [{ platformAdmin: { isNot: null } }, { comMember: { is: { active: true } } }] },
    select: { id: true, platformAdmin: { select: { userId: true } }, comMember: { select: { role: true, active: true } } },
  });
  if (!u) return null;
  const isPlatformAdmin = !!u.platformAdmin;
  const role: ComRole = isPlatformAdmin || u.comMember?.role === "GERENTE" ? "GERENTE" : "VENDEDOR";
  return { userId, role, isPlatformAdmin, meta };
}

export function assertManager(cx: ComCtx) {
  if (cx.role !== "GERENTE") throw new ForbiddenError("Só a gerência comercial pode fazer isso.");
}

const digits = (v: string | null | undefined) => (v ? v.replace(/\D/g, "") : null);
const nameOf = (u: { name: string; email: string } | undefined) => (u ? u.name || u.email : "—");

// ───────────────────────── Configurações (premissas) ─────────────────────────
export async function getSettings() {
  const s = await db.comSettings.findUnique({ where: { id: "default" } });
  return {
    probabilities: mergeStageNumbers(s?.stageProbabilities, "defaultProbability", 0, 100),
    daysToClose: mergeStageNumbers(s?.cycleDays, "defaultDaysToClose", 0, 720),
    churnMonthlyPct: s?.churnMonthlyPct ?? 2,
  };
}

export async function saveSettings(cx: ComCtx, input: { probabilities: Partial<Record<StageKey, number>>; daysToClose: Partial<Record<StageKey, number>>; churnMonthlyPct: number }) {
  assertManager(cx);
  if (!(input.churnMonthlyPct >= 0 && input.churnMonthlyPct <= 50)) throw new ValidationError("O churn mensal deve ficar entre 0% e 50%.");
  const probabilities = mergeStageNumbers(input.probabilities, "defaultProbability", 0, 100);
  const daysToClose = mergeStageNumbers(input.daysToClose, "defaultDaysToClose", 0, 720);
  await db.comSettings.upsert({
    where: { id: "default" },
    create: { id: "default", stageProbabilities: probabilities, cycleDays: daysToClose, churnMonthlyPct: input.churnMonthlyPct },
    update: { stageProbabilities: probabilities, cycleDays: daysToClose, churnMonthlyPct: input.churnMonthlyPct },
  });
  await audit({ action: "comercial.settings_save", userId: cx.userId, meta: cx.meta });
}

// ───────────────────────── Prospects ─────────────────────────
export type ProspectFilters = { q?: string; stage?: StageKey; ownerId?: string; top?: boolean; noCoords?: boolean; overdue?: boolean; page?: number; pageSize?: number };

function whereFrom(f: ProspectFilters): Prisma.ComProspectWhereInput {
  const w: Prisma.ComProspectWhereInput = { deletedAt: null };
  if (f.q) {
    const q = f.q.trim();
    const d = digits(q);
    w.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { legalName: { contains: q, mode: "insensitive" } },
      { district: { contains: q, mode: "insensitive" } },
      ...(d && d.length >= 4 ? [{ cnpj: { contains: d } }, { phone: { contains: d } }] : []),
    ];
  }
  if (f.stage) w.stage = f.stage;
  if (f.ownerId) w.ownerId = f.ownerId === "none" ? null : f.ownerId;
  if (f.top) w.rankingPosition = { not: null };
  if (f.noCoords) w.lat = null;
  if (f.overdue) {
    w.nextActionAt = { lt: new Date() };
    w.stage = { in: OPEN_STAGES };
    w.doNotContact = false;
  }
  return w;
}

export async function listProspects(_cx: ComCtx, f: ProspectFilters = {}) {
  const pageSize = Math.min(100, Math.max(5, f.pageSize ?? 25));
  const page = Math.max(1, f.page ?? 1);
  const where = whereFrom(f);
  const [total, rows] = await Promise.all([
    db.comProspect.count({ where }),
    db.comProspect.findMany({
      where,
      orderBy: [{ rankingPosition: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, cnpj: true, phone: true, email: true, district: true, stage: true, rankingPosition: true, ownerId: true, expectedMonthlyCents: true, nextActionAt: true, lat: true, doNotContact: true },
    }),
  ]);
  return { total, page, pageSize, rows };
}

export async function getProspect(_cx: ComCtx, id: string) {
  const p = await db.comProspect.findFirst({
    where: { id, deletedAt: null },
    include: { contacts: { orderBy: { createdAt: "asc" } }, activities: { orderBy: { createdAt: "desc" }, take: 60 }, proposals: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!p) throw new NotFoundError("Escritório não encontrado.");
  return p;
}

function dataFrom(i: ProspectInput) {
  return {
    name: i.name,
    cnpj: i.cnpj ? normalizeCnpj(i.cnpj) : null,
    legalName: i.legalName,
    phone: i.phone,
    phone2: i.phone2,
    whatsapp: i.whatsapp,
    email: i.email ? i.email.toLowerCase() : null,
    website: i.website,
    street: i.street,
    number: i.number,
    complement: i.complement,
    district: i.district,
    city: i.city || "São Paulo",
    state: (i.state || "SP").toUpperCase(),
    zip: digits(i.zip),
    lawyersEstimate: i.lawyersEstimate,
    areas: i.areas,
    tags: i.tags,
    rankingPosition: i.rankingPosition,
    rankingSource: i.rankingSource,
    ownerId: i.ownerId,
    planKey: i.planKey,
    expectedUsers: i.expectedUsers,
    expectedMonthlyCents: i.expectedMonthlyCents,
    probabilityPct: i.probabilityPct,
    expectedCloseAt: i.expectedCloseAt,
    nextActionAt: i.doNotContact ? null : i.nextActionAt,
    nextActionNote: i.doNotContact ? null : i.nextActionNote,
    notes: i.notes,
    doNotContact: i.doNotContact,
    contactVerified: i.contactVerified,
  };
}

async function assertCnpjFree(cnpj: string | null, exceptId?: string) {
  if (!cnpj) return;
  if (!isValidCnpj(cnpj)) throw new ValidationError("CNPJ inválido. Confira os números.", { cnpj: ["CNPJ inválido."] });
  const dup = await db.comProspect.findFirst({ where: { cnpj, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true, name: true } });
  if (dup) throw new ConflictError(`Esse CNPJ já está cadastrado (${dup.name}).`);
}

export async function createProspect(cx: ComCtx, input: ProspectInput) {
  const data = dataFrom(input);
  await assertCnpjFree(data.cnpj);
  const p = await db.comProspect.create({ data: { ...data, ownerId: data.ownerId ?? cx.userId } });
  await audit({ action: "comercial.prospect_create", userId: cx.userId, resourceType: "com_prospect", resourceId: p.id, meta: cx.meta });
  return p;
}

export async function updateProspect(cx: ComCtx, id: string, input: ProspectInput) {
  const cur = await db.comProspect.findFirst({ where: { id, deletedAt: null }, select: { id: true, cnpj: true, street: true, number: true, zip: true, city: true } });
  if (!cur) throw new NotFoundError("Escritório não encontrado.");
  const data = dataFrom(input);
  await assertCnpjFree(data.cnpj, id);
  const addressChanged = (data.street ?? null) !== cur.street || (data.number ?? null) !== cur.number || (data.zip ?? null) !== cur.zip || data.city !== cur.city;
  await db.comProspect.update({ where: { id }, data: { ...data, ...(addressChanged ? { lat: null, lng: null, geocodedAt: null, geocodeNote: null } : {}) } });
  await audit({ action: "comercial.prospect_update", userId: cx.userId, resourceType: "com_prospect", resourceId: id, meta: cx.meta });
}

export async function deleteProspect(cx: ComCtx, id: string) {
  assertManager(cx);
  const r = await db.comProspect.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), cnpj: null } });
  if (!r.count) throw new NotFoundError("Escritório não encontrado.");
  await audit({ action: "comercial.prospect_delete", userId: cx.userId, resourceType: "com_prospect", resourceId: id, meta: cx.meta });
}

export async function moveStage(cx: ComCtx, id: string, stage: StageKey, opts: { lostReason?: string | null; wonMonthlyCents?: number | null } = {}) {
  const cur = await db.comProspect.findFirst({ where: { id, deletedAt: null }, select: { stage: true, expectedMonthlyCents: true } });
  if (!cur) throw new NotFoundError("Escritório não encontrado.");
  if (cur.stage === stage) return;
  if (stage === "PERDIDO" && !opts.lostReason) throw new ValidationError("Anote o motivo da perda: ajuda a melhorar a abordagem.", { lostReason: ["Informe o motivo."] });
  const won = stage === "GANHO";
  const monthly = won ? (opts.wonMonthlyCents ?? cur.expectedMonthlyCents ?? null) : null;
  if (won && !monthly) throw new ValidationError("Informe o valor mensal fechado.", { wonMonthlyCents: ["Informe o valor mensal."] });
  await db.$transaction([
    db.comProspect.update({
      where: { id },
      data: { stage, stageChangedAt: new Date(), lostReason: stage === "PERDIDO" ? opts.lostReason ?? null : null, wonAt: won ? new Date() : null, wonMonthlyCents: monthly, ...(won ? { nextActionAt: null } : {}) },
    }),
    db.comActivity.create({ data: { prospectId: id, userId: cx.userId, kind: "ETAPA", summary: `${cur.stage} → ${stage}`, outcome: stage === "PERDIDO" ? opts.lostReason ?? null : null } }),
  ]);
  await audit({ action: "comercial.stage_move", userId: cx.userId, resourceType: "com_prospect", resourceId: id, metadata: { from: cur.stage, to: stage }, meta: cx.meta });
}

// ───────────────────────── Contatos e atividades ─────────────────────────
export async function addActivity(cx: ComCtx, prospectId: string, i: { kind: "LIGACAO" | "WHATSAPP" | "EMAIL" | "REUNIAO" | "DEMONSTRACAO" | "NOTA"; summary: string; outcome: string | null; nextActionAt: Date | null }) {
  const p = await db.comProspect.findFirst({ where: { id: prospectId, deletedAt: null }, select: { id: true, doNotContact: true } });
  if (!p) throw new NotFoundError("Escritório não encontrado.");
  if (p.doNotContact && i.kind !== "NOTA") throw new ValidationError("Este escritório está marcado como não contatar. Registre apenas anotações.");
  await db.$transaction([
    db.comActivity.create({ data: { prospectId, userId: cx.userId, kind: i.kind, summary: i.summary, outcome: i.outcome, nextActionAt: i.nextActionAt } }),
    db.comProspect.update({ where: { id: prospectId }, data: { nextActionAt: p.doNotContact ? null : i.nextActionAt, nextActionNote: i.nextActionAt && !p.doNotContact ? i.summary.slice(0, 300) : null } }),
  ]);
}

export async function addContact(_cx: ComCtx, prospectId: string, i: { name: string; role: string | null; phone: string | null; email: string | null; isDecisionMaker: boolean; notes: string | null }) {
  const p = await db.comProspect.findFirst({ where: { id: prospectId, deletedAt: null }, select: { id: true } });
  if (!p) throw new NotFoundError("Escritório não encontrado.");
  await db.comContact.create({ data: { prospectId, name: i.name, role: i.role, phone: i.phone, email: i.email ? i.email.toLowerCase() : null, isDecisionMaker: i.isDecisionMaker, notes: i.notes } });
}

export async function removeContact(_cx: ComCtx, contactId: string) {
  const r = await db.comContact.deleteMany({ where: { id: contactId, prospect: { deletedAt: null } } });
  if (!r.count) throw new NotFoundError("Contato não encontrado.");
}

// ───────────────────────── CNPJ e mapa ─────────────────────────
function applyCnpj(d: CnpjData, current?: { name: string }) {
  return {
    cnpj: d.cnpj,
    name: current?.name ?? d.name,
    legalName: d.legalName,
    phone: d.phone,
    phone2: d.phone2,
    email: d.email,
    street: d.street,
    number: d.number,
    complement: d.complement,
    district: d.district,
    city: d.city ?? "São Paulo",
    state: d.state ?? "SP",
    zip: d.zip,
    cnae: d.cnae,
    openedAt: d.openedAt ? new Date(d.openedAt) : null,
    companySize: d.companySize,
    enrichedAt: new Date(),
  };
}

/** Cria um escritório a partir do CNPJ (dados públicos). Já tentando achar o ponto no mapa. */
export async function createFromCnpj(cx: ComCtx, cnpjInput: string, fetchImpl: typeof fetch = fetch) {
  const cnpj = normalizeCnpj(cnpjInput);
  await assertCnpjFree(cnpj);
  const d = await lookupCnpj(cnpj, fetchImpl);
  const p = await db.comProspect.create({ data: { ...applyCnpj(d), ownerId: cx.userId, tags: [], areas: [], addonKeys: [] } });
  await audit({ action: "comercial.prospect_create", userId: cx.userId, resourceType: "com_prospect", resourceId: p.id, metadata: { via: "cnpj" }, meta: cx.meta });
  await geocodeProspect(cx, p.id, fetchImpl).catch(() => undefined);
  return p;
}

/** Atualiza dados cadastrais pela Receita. Telefone e e-mail digitados pela equipe NÃO são sobrescritos por vazio. */
export async function enrichProspect(cx: ComCtx, id: string, fetchImpl: typeof fetch = fetch) {
  const cur = await db.comProspect.findFirst({ where: { id, deletedAt: null }, select: { id: true, cnpj: true, name: true, phone: true, email: true } });
  if (!cur) throw new NotFoundError("Escritório não encontrado.");
  if (!cur.cnpj) throw new ValidationError("Cadastre o CNPJ primeiro.", { cnpj: ["Informe o CNPJ."] });
  const d = await lookupCnpj(cur.cnpj, fetchImpl);
  const data = applyCnpj(d, { name: cur.name });
  await db.comProspect.update({
    where: { id },
    data: { ...data, phone: data.phone ?? cur.phone, email: data.email ?? cur.email, lat: null, lng: null, geocodedAt: null, geocodeNote: null },
  });
  await audit({ action: "comercial.prospect_enrich", userId: cx.userId, resourceType: "com_prospect", resourceId: id, meta: cx.meta });
  await geocodeProspect(cx, id, fetchImpl).catch(() => undefined);
}

export async function geocodeProspect(_cx: ComCtx, id: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const p = await db.comProspect.findFirst({ where: { id, deletedAt: null }, select: { street: true, number: true, district: true, city: true, state: true, zip: true } });
  if (!p) throw new NotFoundError("Escritório não encontrado.");
  const g = await geocodeAddress(p, fetchImpl);
  await db.comProspect.update({ where: { id }, data: g ? { lat: g.lat, lng: g.lng, geocodedAt: new Date(), geocodeNote: g.note } : { geocodedAt: new Date(), geocodeNote: "Endereço não encontrado no mapa. Confira rua, número e CEP." } });
  return !!g;
}

/** Lote pequeno por chamada (a política do OpenStreetMap pede no máximo 1 consulta por segundo). */
export async function geocodePending(cx: ComCtx, limit = 8, fetchImpl: typeof fetch = fetch) {
  const rows = await db.comProspect.findMany({
    where: { deletedAt: null, lat: null, OR: [{ street: { not: null } }, { zip: { not: null } }], geocodedAt: null },
    orderBy: [{ rankingPosition: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: Math.min(15, Math.max(1, limit)),
    select: { id: true },
  });
  let found = 0;
  for (const r of rows) {
    if (await geocodeProspect(cx, r.id, fetchImpl)) found++;
    await sleep(1100);
  }
  const left = await db.comProspect.count({ where: { deletedAt: null, lat: null, geocodedAt: null, OR: [{ street: { not: null } }, { zip: { not: null } }] } });
  return { tried: rows.length, found, left };
}

export type MapPoint = { id: string; name: string; lat: number; lng: number; stage: StageKey; ranking: number | null; monthlyCents: number | null; district: string | null };

export async function mapPoints(_cx: ComCtx, f: { stage?: StageKey; top?: boolean; ownerId?: string } = {}): Promise<{ points: MapPoint[]; withoutCoords: number }> {
  const base = whereFrom({ stage: f.stage, top: f.top, ownerId: f.ownerId });
  const [rows, withoutCoords] = await Promise.all([
    db.comProspect.findMany({ where: { ...base, lat: { not: null }, lng: { not: null } }, select: { id: true, name: true, lat: true, lng: true, stage: true, rankingPosition: true, expectedMonthlyCents: true, wonMonthlyCents: true, district: true }, take: 3000 }),
    db.comProspect.count({ where: { ...base, lat: null } }),
  ]);
  return {
    withoutCoords,
    points: rows.map((r) => ({ id: r.id, name: r.name, lat: r.lat as number, lng: r.lng as number, stage: r.stage as StageKey, ranking: r.rankingPosition, monthlyCents: r.wonMonthlyCents ?? r.expectedMonthlyCents, district: r.district })),
  };
}

// ───────────────────────── Importação (planilha) ─────────────────────────
export async function importProspects(cx: ComCtx, rows: ImportRow[], opts: { enrich?: boolean; fetchImpl?: typeof fetch } = {}) {
  assertManager(cx);
  if (rows.length > 500) throw new ValidationError("Envie até 500 linhas por vez.");
  let created = 0;
  let updated = 0;
  let enriched = 0;
  const notes: string[] = [];
  for (const r of rows) {
    const existing = r.cnpj ? await db.comProspect.findFirst({ where: { cnpj: r.cnpj, deletedAt: null }, select: { id: true } }) : null;
    const base = {
      name: r.name,
      phone: r.phone,
      email: r.email,
      website: r.website,
      rankingPosition: r.rankingPosition,
      rankingSource: r.rankingSource,
      lawyersEstimate: r.lawyersEstimate,
      ...(r.areas.length ? { areas: r.areas } : {}),
      ...(r.tags.length ? { tags: r.tags } : {}),
      street: r.street,
      number: r.number,
      district: r.district,
      zip: r.zip,
    };
    let id: string;
    if (existing) {
      const clean = Object.fromEntries(Object.entries(base).filter(([, v]) => v !== null && v !== undefined));
      await db.comProspect.update({ where: { id: existing.id }, data: clean });
      id = existing.id;
      updated++;
    } else {
      const p = await db.comProspect.create({ data: { ...base, cnpj: r.cnpj, areas: r.areas, tags: r.tags, addonKeys: [], ownerId: null } });
      id = p.id;
      created++;
    }
    if (opts.enrich && r.cnpj) {
      try {
        await enrichProspect(cx, id, opts.fetchImpl);
        enriched++;
        await sleep(400);
      } catch (e) {
        notes.push(`${r.name}: ${e instanceof Error ? e.message : "falha ao consultar o CNPJ"}`);
      }
    }
  }
  await audit({ action: "comercial.import", userId: cx.userId, metadata: { created, updated, enriched }, meta: cx.meta });
  return { created, updated, enriched, notes: notes.slice(0, 30) };
}

// ───────────────────────── Planos, aditivos e propostas ─────────────────────────
export const DEFAULT_ADDONS = [
  { key: "rute", name: "RUTE (assistente de IA)", description: "A IA do LegalOS: consulta, propostas com confirmação, voz e rotinas. Contratada à parte.", perUser: false, sortOrder: 10 },
  { key: "assinatura", name: "Assinatura de contrato e procuração", description: "Cliente assina pelo celular; o documento vai para o processo.", perUser: false, sortOrder: 20 },
];

export async function ensureDefaultAddons() {
  for (const a of DEFAULT_ADDONS) await db.comAddon.upsert({ where: { key: a.key }, create: { ...a }, update: {} });
}

export async function listCatalog() {
  await ensureDefaultAddons();
  const addons = await db.comAddon.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return { plans: PLAN_CATALOG, addons };
}

export async function saveAddon(cx: ComCtx, i: { key: string; name: string; description: string | null; priceCents: number | null; perUser: boolean; active: boolean }) {
  assertManager(cx);
  await db.comAddon.upsert({ where: { key: i.key }, create: { key: i.key, name: i.name, description: i.description, priceCents: i.priceCents, perUser: i.perUser, active: i.active }, update: { name: i.name, description: i.description, priceCents: i.priceCents, perUser: i.perUser, active: i.active } });
  await audit({ action: "comercial.addon_save", userId: cx.userId, metadata: { key: i.key }, meta: cx.meta });
}

export async function quoteFor(planKey: string, users: number, addonKeys: string[], discountPct: number, setupCents = 0) {
  const plan = findPlan(planKey);
  if (!plan) throw new NotFoundError("Plano não encontrado.");
  const addons = addonKeys.length ? await db.comAddon.findMany({ where: { key: { in: addonKeys }, active: true } }) : [];
  return computeQuote({ planName: plan.name, planPriceCents: plan.priceCents, planMaxUsers: plan.maxUsers, users, addons: addons.map((a) => ({ key: a.key, name: a.name, priceCents: a.priceCents, perUser: a.perUser })), discountPct, setupCents });
}

export async function createProposal(cx: ComCtx, prospectId: string, i: { planKey: string; users: number; addonKeys: string[]; discountPct: number; setupCents: number; validUntil: Date | null; notes: string | null }) {
  const p = await db.comProspect.findFirst({ where: { id: prospectId, deletedAt: null }, select: { id: true } });
  if (!p) throw new NotFoundError("Escritório não encontrado.");
  const quote = await quoteFor(i.planKey, i.users, i.addonKeys, i.discountPct, i.setupCents);
  if (quote.missing.length) throw new ValidationError(`Defina o preço antes: ${quote.missing.join("; ")}.`);
  const prop = await db.comProspect
    .update({
      where: { id: prospectId },
      data: {
        planKey: i.planKey,
        expectedUsers: i.users,
        addonKeys: i.addonKeys,
        expectedMonthlyCents: quote.monthlyCents,
        proposals: { create: { planKey: i.planKey, users: i.users, addonKeys: i.addonKeys, discountPct: i.discountPct, monthlyCents: quote.monthlyCents, setupCents: quote.setupCents, validUntil: i.validUntil, notes: i.notes, createdById: cx.userId, snapshot: quote as unknown as Prisma.InputJsonValue } },
      },
      select: { proposals: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } },
    })
    .then((r) => r.proposals[0]);
  await audit({ action: "comercial.proposal_create", userId: cx.userId, resourceType: "com_prospect", resourceId: prospectId, metadata: { monthlyCents: quote.monthlyCents }, meta: cx.meta });
  return prop;
}

export async function setProposalStatus(cx: ComCtx, proposalId: string, status: "ENVIADA" | "ACEITA" | "RECUSADA") {
  const pr = await db.comProposal.findFirst({ where: { id: proposalId, prospect: { deletedAt: null } }, select: { id: true, prospectId: true, monthlyCents: true } });
  if (!pr) throw new NotFoundError("Proposta não encontrada.");
  await db.comProposal.update({ where: { id: proposalId }, data: { status } });
  if (status === "ENVIADA") {
    const p = await db.comProspect.findUnique({ where: { id: pr.prospectId }, select: { stage: true } });
    if (p && ["IDENTIFICADO", "QUALIFICADO", "CONTATO", "DEMONSTRACAO"].includes(p.stage)) await moveStage(cx, pr.prospectId, "PROPOSTA");
  }
  if (status === "ACEITA") await db.comProspect.update({ where: { id: pr.prospectId }, data: { expectedMonthlyCents: pr.monthlyCents } });
  await audit({ action: "comercial.proposal_status", userId: cx.userId, resourceType: "com_prospect", resourceId: pr.prospectId, metadata: { status }, meta: cx.meta });
}

// ───────────────────────── Painel e projeção ─────────────────────────
export async function dashboard(cx: ComCtx) {
  const settings = await getSettings();
  const now = new Date();
  const prospects = await db.comProspect.findMany({
    where: { deletedAt: null },
    select: { id: true, stage: true, ownerId: true, expectedMonthlyCents: true, wonMonthlyCents: true, probabilityPct: true, expectedCloseAt: true, nextActionAt: true, wonAt: true, rankingPosition: true, lat: true, createdAt: true, doNotContact: true },
  });
  const byStage = Object.fromEntries(STAGE_KEYS.map((k) => [k, { count: 0, valueCents: 0 }])) as Record<StageKey, { count: number; valueCents: number }>;
  const deals: PipelineDeal[] = [];
  let wonMrr = 0;
  let overdue = 0;
  let noValue = 0;
  for (const p of prospects) {
    const st = p.stage as StageKey;
    const v = st === "GANHO" ? (p.wonMonthlyCents ?? p.expectedMonthlyCents ?? 0) : (p.expectedMonthlyCents ?? 0);
    byStage[st].count++;
    byStage[st].valueCents += v;
    if (st === "GANHO") wonMrr += v;
    if ((OPEN_STAGES as string[]).includes(st)) {
      if (!p.expectedMonthlyCents) noValue++;
      if (p.nextActionAt && p.nextActionAt < now && !p.doNotContact) overdue++;
      const prob = p.probabilityPct ?? settings.probabilities[st];
      const days = p.expectedCloseAt ? Math.round((p.expectedCloseAt.getTime() - now.getTime()) / DAY) : settings.daysToClose[st];
      deals.push({ monthlyCents: p.expectedMonthlyCents ?? 0, probabilityPct: prob, closeInMonths: monthsUntil(days) });
    }
  }
  const total = prospects.length;
  const won = byStage.GANHO.count;
  const lost = byStage.PERDIDO.count;
  const projection = computeProjection({ wonMrrCents: wonMrr, deals, churnMonthlyPct: settings.churnMonthlyPct, months: 12 });
  const week = new Date(now.getTime() - 7 * DAY);
  const [acts, members] = await Promise.all([
    db.comActivity.groupBy({ by: ["userId"], where: { createdAt: { gte: week }, kind: { not: "ETAPA" } }, _count: { _all: true } }),
    db.comMember.findMany({ where: { active: true }, select: { userId: true, role: true, goalMonthlyCents: true, user: { select: { name: true, email: true } } } }),
  ]);
  const wonByOwner = new Map<string, number>();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  for (const p of prospects) if (p.stage === "GANHO" && p.ownerId && p.wonAt && p.wonAt >= monthStart) wonByOwner.set(p.ownerId, (wonByOwner.get(p.ownerId) ?? 0) + (p.wonMonthlyCents ?? 0));
  const team = members.map((m) => ({ userId: m.userId, name: nameOf(m.user), role: m.role, goalMonthlyCents: m.goalMonthlyCents, activities7d: acts.find((a) => a.userId === m.userId)?._count._all ?? 0, wonThisMonthCents: wonByOwner.get(m.userId) ?? 0 }));
  return {
    settings,
    total,
    byStage,
    wonMrrCents: wonMrr,
    wonArrCents: wonMrr * 12,
    openCount: deals.length,
    openValueCents: deals.reduce((s, d) => s + d.monthlyCents, 0),
    weightedCents: weightedPipelineCents(deals),
    overdue,
    noValue,
    conversionPct: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
    top100: prospects.filter((p) => p.rankingPosition != null).length,
    withoutMap: prospects.filter((p) => p.lat == null).length,
    projection,
    team,
    viewer: { userId: cx.userId, role: cx.role },
  };
}

// ───────────────────────── Equipe ─────────────────────────
export async function listTeam(_cx: ComCtx) {
  const [members, admins] = await Promise.all([
    db.comMember.findMany({ orderBy: { createdAt: "asc" }, select: { userId: true, role: true, active: true, goalMonthlyCents: true, user: { select: { name: true, email: true, mfa: { select: { enabledAt: true } } } } } }),
    db.platformAdmin.findMany({ select: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  return { members: members.map((m) => ({ userId: m.userId, role: m.role, active: m.active, goalMonthlyCents: m.goalMonthlyCents, name: nameOf(m.user), email: m.user.email, mfa: !!m.user.mfa?.enabledAt })), admins: admins.map((a) => ({ userId: a.user.id, name: nameOf(a.user), email: a.user.email })) };
}

export async function ownersForSelect(_cx: ComCtx) {
  const [members, admins] = await Promise.all([
    db.comMember.findMany({ where: { active: true }, select: { user: { select: { id: true, name: true, email: true } } } }),
    db.platformAdmin.findMany({ select: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  const map = new Map<string, string>();
  for (const x of [...admins, ...members]) map.set(x.user.id, nameOf(x.user));
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function addMember(cx: ComCtx, email: string, role: ComRole) {
  assertManager(cx);
  const u = await db.user.findFirst({ where: { email: email.trim().toLowerCase(), disabledAt: null }, select: { id: true } });
  if (!u) throw new NotFoundError("Não achei um usuário com esse e-mail. A pessoa precisa ter conta no LegalOS (crie por Usuários).");
  await db.comMember.upsert({ where: { userId: u.id }, create: { userId: u.id, role, active: true }, update: { role, active: true } });
  await audit({ action: "comercial.member_add", userId: cx.userId, metadata: { member: u.id, role }, meta: cx.meta });
}

export async function updateMember(cx: ComCtx, userId: string, i: { role?: ComRole; active?: boolean; goalMonthlyCents?: number | null }) {
  assertManager(cx);
  const r = await db.comMember.updateMany({ where: { userId }, data: { ...(i.role ? { role: i.role } : {}), ...(i.active !== undefined ? { active: i.active } : {}), ...(i.goalMonthlyCents !== undefined ? { goalMonthlyCents: i.goalMonthlyCents } : {}) } });
  if (!r.count) throw new NotFoundError("Pessoa não encontrada na equipe.");
  await audit({ action: "comercial.member_update", userId: cx.userId, metadata: { member: userId, ...i }, meta: cx.meta });
}

// ───────────────────────── Base da Receita (importada em /admin/comercial/prospeccao) ─────────────────────────
const titleCase = (v: string) => v.toLowerCase().replace(/(^|[\s(/-])([a-zà-ú])/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase());

/** Procura na base da Receita (somente leitura) e diz quais já estão no funil. */
export async function searchBase(_cx: ComCtx, q?: string, limit = 15) {
  const term = q?.trim().slice(0, 100);
  const d = term ? digits(term) : null;
  const rows = await db.commercialProspect.findMany({
    where: term ? { OR: [{ legalName: { contains: term, mode: "insensitive" } }, { tradeName: { contains: term, mode: "insensitive" } }, ...(d && d.length >= 4 ? [{ cnpj: { contains: d } }] : [])] } : {},
    orderBy: [{ legalName: "asc" }],
    take: Math.min(30, Math.max(1, limit)),
    select: { cnpj: true, legalName: true, tradeName: true, neighborhood: true, phone: true, doNotContact: true, latitude: true, sourceMonth: true },
  });
  const inFunnel = rows.length ? await db.comProspect.findMany({ where: { cnpj: { in: rows.map((r) => r.cnpj) }, deletedAt: null }, select: { id: true, cnpj: true } }) : [];
  const map = new Map(inFunnel.map((x) => [x.cnpj, x.id]));
  const total = await db.commercialProspect.count();
  return { total, rows: rows.map((r) => ({ ...r, funnelId: map.get(r.cnpj) ?? null })) };
}

/** Leva um escritório da base da Receita para o funil, herdando "não contatar", conferência e ponto no mapa. */
export async function addFromBase(cx: ComCtx, cnpj: string) {
  const b = await db.commercialProspect.findUnique({ where: { cnpj: normalizeCnpj(cnpj) } });
  if (!b) throw new NotFoundError("Cadastro não encontrado na base da Receita.");
  await assertCnpjFree(b.cnpj);
  const hasPoint = b.latitude != null && b.longitude != null;
  const p = await db.comProspect.create({
    data: {
      cnpj: b.cnpj,
      name: titleCase(b.tradeName || b.legalName).slice(0, 160),
      legalName: titleCase(b.legalName),
      phone: b.phone || null,
      email: b.email ? b.email.toLowerCase() : null,
      street: b.address ? titleCase(b.address).slice(0, 200) : null,
      district: b.neighborhood ? titleCase(b.neighborhood) : null,
      zip: b.postalCode || null,
      cnae: b.cnae,
      companySize: b.companySize || null,
      lat: hasPoint ? b.latitude : null,
      lng: hasPoint ? b.longitude : null,
      geocodedAt: hasPoint ? new Date() : null,
      geocodeNote: hasPoint ? `Base da Receita (${b.locationAccuracy === "POSTAL_CODE" ? "aproximada por CEP" : "endereço conferido"})` : null,
      rankingSource: `Base da Receita (competência ${b.sourceMonth})`,
      doNotContact: b.doNotContact,
      contactVerified: b.contactVerified,
      ownerId: cx.userId,
      areas: [],
      tags: [],
      addonKeys: [],
    },
  });
  await audit({ action: "comercial.prospect_create", userId: cx.userId, resourceType: "com_prospect", resourceId: p.id, metadata: { via: "base_receita" }, meta: cx.meta });
  return p;
}
