import { describe, expect, it } from "vitest";
import { lookupCnpj, parseBrasilApiCnpj, formatPhone, CnpjLookupError } from "@/lib/comercial/cnpj";
import { geocodeAddress, inBrazil } from "@/lib/comercial/geocode";
import { normalizeDelimiter, parseImport } from "@/lib/comercial/import-rows";
import { computeQuote } from "@/lib/comercial/pricing";
import { computeProjection, monthsUntil, weightedPipelineCents } from "@/lib/comercial/projection";
import { reaisToCents, prospectSchema, proposalSchema } from "@/lib/comercial/schemas";
import { mergeStageNumbers } from "@/lib/comercial/stages";

describe("projeção de receita", () => {
  it("sem funil, o MRR só sofre churn", () => {
    const p = computeProjection({ wonMrrCents: 100_000, deals: [], churnMonthlyPct: 10, months: 2 });
    const r = p.series.find((s) => s.key === "realista")!;
    expect(r.mrrByMonth).toEqual([90_000, 81_000]);
  });
  it("negócio entra no mês certo, com valor × chance; cenários escalam a chance e limitam em 100%", () => {
    const deals = [{ monthlyCents: 100_000, probabilityPct: 50, closeInMonths: 2 }];
    const p = computeProjection({ wonMrrCents: 0, deals, churnMonthlyPct: 0, months: 3 });
    const by = (k: string) => p.series.find((s) => s.key === k)!.mrrByMonth;
    expect(by("realista")).toEqual([0, 50_000, 50_000]);
    expect(by("conservador")[1]).toBe(30_000);
    expect(by("otimista")[1]).toBe(65_000);
    const sure = computeProjection({ wonMrrCents: 0, deals: [{ monthlyCents: 100, probabilityPct: 90, closeInMonths: 1 }], churnMonthlyPct: 0, months: 1 });
    expect(sure.series.find((s) => s.key === "otimista")!.mrrByMonth[0]).toBe(100);
  });
  it("valor ponderado e meses até fechar", () => {
    expect(weightedPipelineCents([{ monthlyCents: 200, probabilityPct: 25 }, { monthlyCents: 100, probabilityPct: 100 }])).toBe(150);
    expect(monthsUntil(0)).toBe(1);
    expect(monthsUntil(31)).toBe(2);
  });
  it("ignora valores absurdos (churn acima de 50%, negativos)", () => {
    const p = computeProjection({ wonMrrCents: -5, deals: [{ monthlyCents: -10, probabilityPct: 200, closeInMonths: 1 }], churnMonthlyPct: 900, months: 1 });
    expect(p.series[0]!.mrrByMonth[0]).toBe(0);
  });
});

describe("preço da proposta", () => {
  const plan = { planName: "Pro", planPriceCents: 29_900, planMaxUsers: 10 };
  it("soma plano e aditivos (fixo e por usuário) e aplica desconto", () => {
    const q = computeQuote({ ...plan, users: 5, discountPct: 10, addons: [{ key: "rute", name: "RUTE", priceCents: 10_000, perUser: false }, { key: "x", name: "X", priceCents: 1_000, perUser: true }] });
    expect(q.subtotalCents).toBe(29_900 + 10_000 + 5_000);
    expect(q.discountCents).toBe(Math.round(44_900 * 0.1));
    expect(q.monthlyCents).toBe(44_900 - 4_490);
    expect(q.missing).toEqual([]);
  });
  it("preço ausente vira aviso, nunca zero escondido; usuários acima do plano geram alerta", () => {
    const q = computeQuote({ ...plan, planPriceCents: null, users: 12, discountPct: 0, addons: [{ key: "rute", name: "RUTE", priceCents: null, perUser: false }] });
    expect(q.missing).toHaveLength(2);
    expect(q.warnings[0]).toMatch(/até 10/);
    expect(q.monthlyCents).toBe(0);
  });
});

describe("CNPJ (BrasilAPI)", () => {
  const raw = { cnpj: "00000000000191", razao_social: "FULANO E BELTRANO SOCIEDADE DE ADVOGADOS", nome_fantasia: "FULANO ADVOGADOS", ddd_telefone_1: "1133334444", ddd_telefone_2: "11987654321", email: "CONTATO@FULANO.COM.BR", descricao_tipo_de_logradouro: "AVENIDA", logradouro: "PAULISTA", numero: "1000", bairro: "BELA VISTA", municipio: "SAO PAULO", uf: "sp", cep: "01310100", cnae_fiscal: 6911701, cnae_fiscal_descricao: "Serviços advocatícios", qsa: [{ nome_socio: "MARIA DA SILVA", qualificacao_socio: "Sócio-Administrador" }] };
  it("mapeia e formata", () => {
    const d = parseBrasilApiCnpj(raw);
    expect(d.name).toBe("Fulano Advogados");
    expect(d.phone).toBe("(11) 3333-4444");
    expect(d.phone2).toBe("(11) 98765-4321");
    expect(d.email).toBe("contato@fulano.com.br");
    expect(d.street).toBe("Avenida Paulista");
    expect(d.state).toBe("SP");
    expect(d.zip).toBe("01310100");
    expect(d.cnae).toContain("6911701");
    expect("partners" in d).toBe(false); // LGPD: dados de sócios não são guardados
    expect(formatPhone("123")).toBeNull();
  });
  it("consulta com fetch simulado e trata erros", async () => {
    const ok = (async () => new Response(JSON.stringify(raw), { status: 200 })) as unknown as typeof fetch;
    expect((await lookupCnpj("00.000.000/0001-91", ok)).cnpj).toBe("00000000000191");
    const nf = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    await expect(lookupCnpj("00000000000191", nf)).rejects.toThrow(CnpjLookupError);
    await expect(lookupCnpj("123", ok)).rejects.toThrow(/inválido/);
  });
});

describe("mapa (OpenStreetMap)", () => {
  it("só aceita coordenadas no Brasil", () => {
    expect(inBrazil(-23.55, -46.63)).toBe(true);
    expect(inBrazil(40.7, -74)).toBe(false);
  });
  it("geocodifica pelo primeiro resultado válido e identifica o app", async () => {
    let seen = "";
    let ua = "";
    const f = (async (url: string, init: RequestInit) => { seen = url; ua = String((init.headers as Record<string, string>)["user-agent"]); return new Response(JSON.stringify([{ lat: "-23.5614", lon: "-46.6559" }]), { status: 200 }); }) as unknown as typeof fetch;
    const g = await geocodeAddress({ street: "Avenida Paulista", number: "1000", city: "São Paulo", state: "SP", zip: "01310100" }, f);
    expect(g).toMatchObject({ lat: -23.5614, lng: -46.6559 });
    expect(seen).toContain("countrycodes=br");
    expect(seen).toContain("postalcode=01310-100");
    expect(ua).toContain("LegalOS");
  });
  it("sem endereço não consulta", async () => {
    const f = (async () => { throw new Error("não deveria chamar"); }) as unknown as typeof fetch;
    expect(await geocodeAddress({}, f)).toBeNull();
  });
});

describe("importação de planilha", () => {
  it("lê CSV com ; e cabeçalhos em português, valida CNPJ e acusa repetidos", () => {
    const csv = "Nome;CNPJ;Ranking;Fonte;Áreas\nA Advogados;00.000.000/0001-91;1;Ranking X;Cível | Trabalhista\nB Advogados;11.111.111/1111-11;2;;\nC;00.000.000/0001-91;3;;\n;;;;";
    const r = parseImport(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ name: "A Advogados", cnpj: "00000000000191", rankingPosition: 1, areas: ["Cível", "Trabalhista"] });
    expect(r.errors.some((e) => /inválido/.test(e))).toBe(true);
    expect(r.errors.some((e) => /repetido/.test(e))).toBe(true);
    expect(r.errors.some((e) => /sem nome/.test(e))).toBe(true);
  });
  it("não troca ; dentro de aspas", () => {
    expect(normalizeDelimiter('nome;obs\n"a;b";x')).toBe('nome,obs\n"a;b",x');
  });
});

describe("validação e premissas", () => {
  it("reais → centavos em vários formatos", () => {
    expect(reaisToCents("1.490,50")).toBe(149_050);
    expect(reaisToCents("1490.5")).toBe(149_050);
    expect(reaisToCents("")).toBeNull();
    expect(reaisToCents("abc")).toBeNull();
  });
  it("cadastro exige nome e e-mail válido", () => {
    expect(prospectSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(prospectSchema.safeParse({ name: "Alfa Advogados", email: "x" }).success).toBe(false);
    const ok = prospectSchema.parse({ name: "Alfa Advogados", expectedMonthlyCents: "1.490,00", areas: "Cível, Trabalhista" });
    expect(ok.expectedMonthlyCents).toBe(149_000);
    expect(ok.areas).toEqual(["Cível", "Trabalhista"]);
    expect(proposalSchema.parse({ planKey: "pro", users: "5" }).users).toBe(5);
  });
  it("premissas salvas inválidas voltam ao padrão; ganho e perdido são fixos", () => {
    const p = mergeStageNumbers({ CONTATO: 40, PROPOSTA: 500, GANHO: 3 }, "defaultProbability", 0, 100);
    expect(p.CONTATO).toBe(40);
    expect(p.PROPOSTA).toBe(50);
    expect(p.GANHO).toBe(100);
    expect(p.PERDIDO).toBe(0);
  });
});
