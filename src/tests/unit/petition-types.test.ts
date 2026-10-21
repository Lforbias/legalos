import { describe, expect, it } from "vitest";
import { PETITION_ATTACHMENT_CLASSES, PETITION_TYPE_KEYS, PETITION_TYPE_LABEL } from "@/lib/petitioning/types";
import { ATTACHMENT_CLASSES } from "@/server/services/petition.service";
import { ATTACHMENT_CLASS_LABEL } from "@/modules/petitions/schemas";
import { buildEntregarManifestacao } from "@/lib/mni/xml";

describe("tipos de documento do protocolo", () => {
  it("as classificações de anexo são as mesmas do serviço e da interface", () => {
    expect([...PETITION_ATTACHMENT_CLASSES]).toEqual([...ATTACHMENT_CLASSES]);
    expect(Object.keys(ATTACHMENT_CLASS_LABEL).sort()).toEqual([...PETITION_ATTACHMENT_CLASSES].sort());
    for (const k of PETITION_TYPE_KEYS) expect(PETITION_TYPE_LABEL[k]).toBeTruthy();
  });
  it("o envelope escapa atributos e carrega o conteúdo em base64", () => {
    const xml = buildEntregarManifestacao({ document: "52998224725", password: "s&nha<>" }, "00077770520245050001", [{ tipoDocumento: 'A"1', mimetype: "application/pdf", descricao: "Peça <x>", conteudo: Buffer.from("abc") }], new Date("2026-10-20T13:00:00Z"));
    expect(xml).toContain("s&amp;nha&lt;&gt;");
    expect(xml).toContain('tipoDocumento="A&quot;1"');
    expect(xml).toContain("descricao=\"Peça &lt;x&gt;\"");
    expect(xml).toContain(`<conteudo>${Buffer.from("abc").toString("base64")}</conteudo>`);
    expect(xml).toContain("<dataEnvio>20261020100000</dataEnvio>");
  });
});
