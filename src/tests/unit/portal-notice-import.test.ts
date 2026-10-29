import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { inspectTrf3Notices } from "../../../extensions/legalos-pje/notices.mjs";
import { portalNoticeBatchSchema, portalObservationKey } from "@/lib/pje/portal-import";
import { computeCnjCheck } from "@/lib/validation/br-documents";

const cnj = `0000001-${computeCnjCheck({ sequence: "0000001", year: "2026", segment: "4", court: "03", origin: "6342" })}.2026.4.03.6342`;
const text = `Pessoa fictícia\nDecisão (12345678)\nDiário Eletrônico (13/10/2026 15:42)\nPrazo:15 dias\nO sistema registrou ciência em 15/10/2026 00:00\nPJEC ${cnj}\nÚltimo movimento: Publicado Decisão.`;
const item = { caseNumber: cnj, reference: "12345678", title: "Decisão", communicatedAt: "2026-10-13 15:42" };
const batch = { sourceOrigin: "https://pje1g.trf3.jus.br", sourcePath: "/pje/Painel/painel_usuario/advogado.seam", confirmed: true, items: [item] };
function inspect(rows: { text: string; nested?: boolean; visible?: boolean }[], origin = batch.sourceOrigin, password = false) {
  const win: { top?: unknown } = {}; win.top = win;
  const context = vm.createContext({ window: win, location: { origin, pathname: batch.sourcePath }, getComputedStyle: () => ({ visibility: "visible" }), document: {
    querySelector: () => password ? {} : null,
    querySelectorAll: () => rows.map(r => ({ innerText: r.text, getClientRects: () => r.visible === false ? [] : [{}], querySelector: () => r.nested ? {} : null })),
  } });
  return vm.runInContext(`(${inspectTrf3Notices.toString()})()`, context);
}
describe("captura assistida de metadados do PJe/TRF3", () => {
  it("lê o formato observado sem nomes, teor, estado oficial ou valores de formulários", () => {
    const result = inspect([{ text }]);
    expect(result.ok).toBe(true); expect(result.items).toEqual([item]);
    expect(JSON.stringify(result)).not.toContain("Pessoa fictícia");
    expect(JSON.stringify(result)).not.toContain("ciência em");
    expect(portalNoticeBatchSchema.parse({ ...batch, items: result.items }).items).toEqual([item]);
  });
  it("não interpreta totais, linhas ocultas, tabelas externas, CNJs isolados ou linhas ambíguas", () => {
    expect(inspect([{ text: "18 pendentes" }, { text, visible: false }, { text, nested: true }, { text: cnj }]).ok).toBe(false);
    expect(inspect([{ text: text.replace("Decisão (12345678)", "Documento desconhecido") }]).ok).toBe(false);
  });
  it("para fora do TRF3 e na tela de senha, sem fazer rede ou clicar", () => {
    expect(inspect([{ text }], "https://pje1g.trf1.jus.br").ok).toBe(false);
    expect(inspect([{ text }], batch.sourceOrigin, true).ok).toBe(false);
  });
  it("deduplica a observação e mantém referências/comunicações distintas separadas", () => {
    expect(inspect([{ text }, { text }]).items).toHaveLength(1);
    expect(portalObservationKey(item)).toBe(portalObservationKey({ ...item, title: "Decisão atualizada" }));
    expect(portalObservationKey(item)).not.toBe(portalObservationKey({ ...item, reference: "12345679" }));
    expect(portalObservationKey(item)).not.toBe(portalObservationKey({ ...item, communicatedAt: "2026-10-14 15:42" }));
  });
  it("recusa origem arbitrária, sessão na URL, ausência de confirmação, data/CNJ inválidos e campos extras", () => {
    expect(portalNoticeBatchSchema.safeParse(batch).success).toBe(true);
    for (const raw of [{ ...batch, confirmed: false }, { ...batch, sourceOrigin: "https://evil.test" }, { ...batch, sourcePath: `${batch.sourcePath}?token=x` }, { ...batch, cookie: "x" }, { ...batch, items: [{ ...item, communicatedAt: "2026-02-30 25:61" }] }, { ...batch, items: [{ ...item, caseNumber: "0000000-00.2026.4.03.6342" }] }]) expect(portalNoticeBatchSchema.safeParse(raw).success).toBe(false);
  });
});
