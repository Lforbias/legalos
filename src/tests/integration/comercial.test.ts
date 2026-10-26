import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { prospectSchema } from "@/lib/comercial/schemas";
import { parseImport } from "@/lib/comercial/import-rows";
import * as svc from "@/server/services/comercial.service";
import { makeUser, META } from "./helpers";

const withMfa = (userId: string) => db.userMfa.create({ data: { userId, secretEnc: "x", enabledAt: new Date() } });
const P = (name: string, extra: Record<string, unknown> = {}) => prospectSchema.parse({ name, ...extra });

const cnpjBody = { cnpj: "00000000000191", razao_social: "ALFA SOCIEDADE DE ADVOGADOS", nome_fantasia: "ALFA ADVOGADOS", ddd_telefone_1: "1133334444", email: "contato@alfa.com", logradouro: "PAULISTA", numero: "1000", bairro: "BELA VISTA", municipio: "SAO PAULO", uf: "SP", cep: "01310100", cnae_fiscal: 6911701, cnae_fiscal_descricao: "Serviços advocatícios", qsa: [{ nome_socio: "MARIA SILVA", qualificacao_socio: "Sócio" }] };
const fakeFetch = (async (url: string) => {
  if (String(url).includes("/cnpj/")) return new Response(JSON.stringify(cnpjBody), { status: 200 });
  return new Response(JSON.stringify([{ lat: "-23.5614", lon: "-46.6559" }]), { status: 200 });
}) as unknown as typeof fetch;

describe("8.0 — LegalOS Comercial", () => {
  let mgr: svc.ComCtx;
  let seller: svc.ComCtx;
  let outsider: string;
  let noMfa: string;

  beforeAll(async () => {
    const admin = await makeUser("com-admin");
    await db.platformAdmin.create({ data: { userId: admin.id } });
    await withMfa(admin.id);
    const s = await makeUser("com-seller");
    await withMfa(s.id);
    await db.comMember.create({ data: { userId: s.id, role: "VENDEDOR" } });
    outsider = (await makeUser("com-out")).id;
    await withMfa(outsider);
    noMfa = (await makeUser("com-nomfa")).id;
    await db.comMember.create({ data: { userId: noMfa, role: "VENDEDOR" } });
    mgr = (await svc.resolveComContext(admin.id, META)) as svc.ComCtx;
    seller = (await svc.resolveComContext(s.id, META)) as svc.ComCtx;
  });

  it("acesso: admin e vendedor com 2FA entram; estranho e sem 2FA não", async () => {
    expect(mgr.role).toBe("GERENTE");
    expect(seller.role).toBe("VENDEDOR");
    expect(await svc.comAccessState(outsider)).toBe("no_access");
    expect(await svc.comAccessState(noMfa)).toBe("needs_mfa");
    expect(await svc.resolveComContext(noMfa, META)).toBeNull();
    expect(await svc.resolveComContext(outsider, META)).toBeNull();
    await db.comMember.update({ where: { userId: seller.userId }, data: { active: false } });
    expect(await svc.comAccessState(seller.userId)).toBe("no_access");
    await db.comMember.update({ where: { userId: seller.userId }, data: { active: true } });
  });

  it("cadastro por CNPJ preenche dados, acha o ponto no mapa e bloqueia duplicado", async () => {
    const p = await svc.createFromCnpj(seller, "00.000.000/0001-91", fakeFetch);
    const full = await svc.getProspect(seller, p.id);
    expect(full).toMatchObject({ name: "Alfa Advogados", phone: "(11) 3333-4444", district: "Bela Vista", lat: -23.5614, lng: -46.6559, stage: "IDENTIFICADO", ownerId: seller.userId });
    await expect(svc.createFromCnpj(seller, "00000000000191", fakeFetch)).rejects.toThrow(ConflictError);
    await expect(svc.createFromCnpj(seller, "123", fakeFetch)).rejects.toThrow(ValidationError);
  });

  it("não sobrescreve telefone digitado por vazio ao atualizar pela Receita", async () => {
    const p = await db.comProspect.findUniqueOrThrow({ where: { cnpj: "00000000000191" } });
    await svc.updateProspect(seller, p.id, P("Alfa Advogados", { cnpj: p.cnpj, phone: "(11) 90000-0000", street: "Avenida Paulista", number: "1000", zip: "01310100" }));
    const semFone = (async (url: string) => String(url).includes("/cnpj/") ? new Response(JSON.stringify({ ...cnpjBody, ddd_telefone_1: "" }), { status: 200 }) : new Response("[]", { status: 200 })) as unknown as typeof fetch;
    await svc.enrichProspect(seller, p.id, semFone);
    expect((await svc.getProspect(seller, p.id)).phone).toBe("(11) 90000-0000");
  });

  it("endereço alterado limpa o ponto antigo; geocodificação em lote respeita o limite", async () => {
    const a = await svc.createProspect(seller, P("Beta Advogados", { street: "Rua Augusta", number: "100", zip: "01305000" }));
    const b = await svc.createProspect(seller, P("Gama Advogados", { street: "Rua Direita", number: "1" }));
    const r = await svc.geocodePending(seller, 2, fakeFetch);
    expect(r.tried).toBe(2);
    expect(r.found).toBe(2);
    expect((await svc.getProspect(seller, a.id)).lat).not.toBeNull();
    await svc.updateProspect(seller, b.id, P("Gama Advogados", { street: "Rua Libero Badaró", number: "1" }));
    expect((await svc.getProspect(seller, b.id)).lat).toBeNull();
  }, 20000);

  it("funil: perdido exige motivo, ganho exige valor; histórico registra a mudança", async () => {
    const p = await svc.createProspect(seller, P("Delta Advogados"));
    await svc.moveStage(seller, p.id, "CONTATO");
    await expect(svc.moveStage(seller, p.id, "PERDIDO")).rejects.toThrow(ValidationError);
    await expect(svc.moveStage(seller, p.id, "GANHO")).rejects.toThrow(ValidationError);
    await svc.moveStage(seller, p.id, "GANHO", { wonMonthlyCents: 59_900 });
    const g = await svc.getProspect(seller, p.id);
    expect(g).toMatchObject({ stage: "GANHO", wonMonthlyCents: 59_900 });
    expect(g.wonAt).not.toBeNull();
    expect(g.activities.filter((a) => a.kind === "ETAPA")).toHaveLength(2);
    await svc.moveStage(seller, p.id, "PERDIDO", { lostReason: "Cancelou" });
    expect((await svc.getProspect(seller, p.id)).wonAt).toBeNull();
  });

  it("registro de contato atualiza o próximo retorno; contatos podem ser adicionados e removidos", async () => {
    const p = await svc.createProspect(seller, P("Épsilon Advogados"));
    const when = new Date(Date.now() + 86_400_000);
    await svc.addActivity(seller, p.id, { kind: "LIGACAO", summary: "Falei com a recepção", outcome: "Pediu e-mail", nextActionAt: when });
    expect((await svc.getProspect(seller, p.id)).nextActionAt?.getTime()).toBe(when.getTime());
    await svc.addContact(seller, p.id, { name: "Dr. João", role: "Sócio", phone: null, email: "JOAO@X.COM", isDecisionMaker: true, notes: null });
    const c = (await svc.getProspect(seller, p.id)).contacts[0]!;
    expect(c.email).toBe("joao@x.com");
    await svc.removeContact(seller, c.id);
    expect((await svc.getProspect(seller, p.id)).contacts).toHaveLength(0);
  });

  it("proposta: usa preço do plano + aditivos, exige preço definido e atualiza o valor previsto", async () => {
    const plan = { key: "intermediario" }; // preço oficial (R$ 349) vem de src/config/pricing.ts
    await svc.ensureDefaultAddons();
    const p = await svc.createProspect(seller, P("Zeta Advogados"));
    const input = { planKey: plan.key, users: 5, addonKeys: ["rute"], discountPct: 0, setupCents: 0, validUntil: null, notes: null };
    await expect(svc.createProposal(seller, p.id, input)).rejects.toThrow(/sem preço/);
    await svc.saveAddon(mgr, { key: "rute", name: "RUTE (assistente de IA)", description: null, priceCents: 9_900, perUser: false, active: true });
    await svc.createProposal(seller, p.id, input);
    const g = await svc.getProspect(seller, p.id);
    expect(g.expectedMonthlyCents).toBe(44_800);
    expect(g.proposals[0]).toMatchObject({ monthlyCents: 44_800, status: "RASCUNHO" });
    await svc.setProposalStatus(seller, g.proposals[0]!.id, "ENVIADA");
    expect((await svc.getProspect(seller, p.id)).stage).toBe("PROPOSTA");
  });

  it("só a gerência altera aditivos, premissas, equipe, importa e remove", async () => {
    await expect(svc.saveAddon(seller, { key: "x", name: "X", description: null, priceCents: 1, perUser: false, active: true })).rejects.toThrow(ForbiddenError);
    await expect(svc.saveSettings(seller, { probabilities: {}, daysToClose: {}, churnMonthlyPct: 2 })).rejects.toThrow(ForbiddenError);
    await expect(svc.importProspects(seller, [])).rejects.toThrow(ForbiddenError);
    await expect(svc.addMember(seller, "a@b.com", "VENDEDOR")).rejects.toThrow(ForbiddenError);
    const p = await svc.createProspect(seller, P("Eta Advogados"));
    await expect(svc.deleteProspect(seller, p.id)).rejects.toThrow(ForbiddenError);
    await svc.deleteProspect(mgr, p.id);
    await expect(svc.getProspect(mgr, p.id)).rejects.toThrow(NotFoundError);
  });

  it("importação cria, atualiza sem duplicar e consulta a Receita", async () => {
    const { rows } = parseImport("nome;cnpj;ranking;fonte\nIota Advogados;11.222.333/0001-81;7;Ranking Teste\nKappa;;8;Ranking Teste");
    const r1 = await svc.importProspects(mgr, rows, { enrich: false });
    expect(r1).toMatchObject({ created: 2, updated: 0 });
    const r2 = await svc.importProspects(mgr, rows, { enrich: false });
    expect(r2.updated).toBe(1);
    expect(await db.comProspect.count({ where: { cnpj: "11222333000181" } })).toBe(1);
    const list = await svc.listProspects(mgr, { top: true });
    expect(list.rows.some((x) => x.name === "Iota Advogados" && x.rankingPosition === 7)).toBe(true);
  });

  it("painel soma MRR ganho, funil ponderado e projeção; premissas editáveis", async () => {
    await svc.saveSettings(mgr, { probabilities: { PROPOSTA: 80 }, daysToClose: { PROPOSTA: 30 }, churnMonthlyPct: 0 });
    const won = await svc.createProspect(seller, P("Ômega Advogados", { expectedMonthlyCents: "1.000,00" }));
    await svc.moveStage(seller, won.id, "GANHO", { wonMonthlyCents: 100_000 });
    const open = await svc.createProspect(seller, P("Sigma Advogados", { expectedMonthlyCents: "500,00", nextActionAt: new Date(Date.now() - 86_400_000).toISOString() }));
    await svc.moveStage(seller, open.id, "PROPOSTA");
    const d = await svc.dashboard(mgr);
    expect(d.wonMrrCents).toBeGreaterThanOrEqual(100_000);
    expect(d.settings.probabilities.PROPOSTA).toBe(80);
    expect(d.overdue).toBeGreaterThanOrEqual(1);
    const real = d.projection.series.find((s) => s.key === "realista")!;
    expect(real.mrrByMonth).toHaveLength(12);
    expect(real.mrrEndCents).toBeGreaterThan(d.wonMrrCents);
  });

  it("mapa só devolve escritórios com coordenadas e conta os sem ponto", async () => {
    const m = await svc.mapPoints(seller, {});
    expect(m.points.length).toBeGreaterThan(0);
    expect(m.points.every((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng))).toBe(true);
    expect(m.withoutCoords).toBeGreaterThan(0);
  });

  it("não contatar: bloqueia contato, tira dos atrasados e aceita só anotação", async () => {
    const p = await svc.createProspect(seller, P("Lambda Advogados", { nextActionAt: new Date(Date.now() - 86_400_000).toISOString() }));
    await svc.updateProspect(seller, p.id, P("Lambda Advogados", { doNotContact: true }));
    const g = await svc.getProspect(seller, p.id);
    expect(g.doNotContact).toBe(true);
    expect(g.nextActionAt).toBeNull();
    await expect(svc.addActivity(seller, p.id, { kind: "LIGACAO", summary: "ligar", outcome: null, nextActionAt: null })).rejects.toThrow(ValidationError);
    await svc.addActivity(seller, p.id, { kind: "NOTA", summary: "Pediu para não ser procurado", outcome: null, nextActionAt: new Date(Date.now() + 86_400_000) });
    expect((await svc.getProspect(seller, p.id)).nextActionAt).toBeNull();
    const overdue = await svc.listProspects(seller, { overdue: true });
    expect(overdue.rows.some((x) => x.id === p.id)).toBe(false);
  });

  it("base da Receita: busca, leva para o funil herdando não contatar e não duplica", async () => {
    const mk = (cnpj: string, legalName: string, extra: Record<string, unknown> = {}) => db.commercialProspect.create({ data: { cnpj, legalName, tradeName: "", address: "Rua A 1", neighborhood: "CENTRO", phone: "1133330000", cnae: "6911701", sourceMonth: "2026-10", ...extra } });
    await mk("45723174000110", "BASE TESTE UM ADVOGADOS", { latitude: -23.55, longitude: -46.63, locationAccuracy: "ADDRESS", contactVerified: true });
    await mk("33000167000101", "BASE TESTE DOIS ADVOGADOS", { doNotContact: true });
    const found = await svc.searchBase(seller, "base teste");
    expect(found.rows.map((r) => r.cnpj)).toEqual(expect.arrayContaining(["45723174000110", "33000167000101"]));
    const a = await svc.addFromBase(seller, "45.723.174/0001-10");
    expect(a).toMatchObject({ cnpj: "45723174000110", lat: -23.55, contactVerified: true, doNotContact: false });
    const b = await svc.addFromBase(seller, "33000167000101");
    expect(b.doNotContact).toBe(true);
    await expect(svc.addFromBase(seller, "45723174000110")).rejects.toThrow();
    expect((await svc.searchBase(seller, "base teste")).rows.every((r) => r.funnelId)).toBe(true);
    await expect(svc.addFromBase(seller, "11222333000181")).rejects.toThrow(NotFoundError);
  });

  it("amostra: importa sem duplicar nem sobrescrever negociação; vendedor não importa em lote", async () => {
    await expect(svc.addBaseSample(seller)).rejects.toThrow(ForbiddenError);
    await db.commercialProspect.create({ data: { cnpj: "99999999000191", legalName: "Amostra adicional", address: "Rua teste", cnae: "6911701", sourceMonth: "2026-10", doNotContact: true, notes: "Preservar bloqueio" } });
    expect((await svc.addBaseSample(mgr)).created).toBe(1);
    expect((await svc.addBaseSample(mgr)).created).toBe(0);
    const row = await db.comProspect.findUniqueOrThrow({ where: { cnpj: "99999999000191" } });
    expect(row).toMatchObject({ doNotContact: true, notes: "Preservar bloqueio", rankingPosition: null });
    await db.comProspect.update({ where: { id: row.id }, data: { notes: "Negociação preservada" } });
    await svc.addBaseSample(mgr);
    expect((await db.comProspect.findUniqueOrThrow({ where: { id: row.id } })).notes).toBe("Negociação preservada");
  });

  it("mapa: falha externa mantém endereço disponível para nova tentativa", async () => {
    const row = await svc.createProspect(seller, P("Consulta indisponível", { street: "Rua exemplo", zip: "01310100" }));
    const unavailable = (async () => new Response("indisponível", { status: 503 })) as typeof fetch;
    await expect(svc.geocodeProspect(seller, row.id, unavailable)).rejects.toThrow(ValidationError);
    expect((await svc.getProspect(seller, row.id)).geocodedAt).toBeNull();
  });

  it("equipe: adicionar por e-mail exige conta existente", async () => {
    await expect(svc.addMember(mgr, "naoexiste@example.test", "VENDEDOR")).rejects.toThrow(NotFoundError);
    const u = await makeUser("com-new");
    await svc.addMember(mgr, u.email, "VENDEDOR");
    expect((await svc.listTeam(mgr)).members.some((x) => x.userId === u.id)).toBe(true);
  });
});
