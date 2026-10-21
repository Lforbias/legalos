import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { birthdaysWithin, nextBirthday } from "@/lib/birthdays";
import { mfaBlockedFor } from "@/lib/mfa-policy";
import { colName, toXlsx } from "@/lib/reports/xlsx";
import { sendTextSchema } from "@/modules/whatsapp/send-schema";
import { birthdayText, caseText } from "@/server/services/chat-send.service";

describe("2.0-F6 — aniversários", () => {
  it("próximo aniversário: hoje, daqui a dias, virada de ano e 29/02", () => {
    expect(nextBirthday("1980-10-21", "2026-10-21")).toEqual({ date: "2026-10-21", turns: 46, daysLeft: 0 });
    expect(nextBirthday("1980-10-25", "2026-10-21")).toEqual({ date: "2026-10-25", turns: 46, daysLeft: 4 });
    expect(nextBirthday("1980-01-02", "2026-12-30")).toEqual({ date: "2027-01-02", turns: 47, daysLeft: 3 });
    expect(nextBirthday("1980-10-20", "2026-10-21").date).toBe("2027-10-20");
    expect(nextBirthday("2000-02-29", "2027-02-20").date).toBe("2027-02-28"); // ano não bissexto
    expect(nextBirthday("2000-02-29", "2028-02-20").date).toBe("2028-02-29"); // bissexto
  });
  it("lista os próximos 7 dias em ordem e ignora o resto", () => {
    const rows = birthdaysWithin(
      [
        { id: "a", name: "Zélia", birthDate: "1970-10-23" },
        { id: "b", name: "Ana", birthDate: "1990-10-21" },
        { id: "c", name: "Bruno", birthDate: "1985-10-23" },
        { id: "d", name: "Longe", birthDate: "1985-12-01" },
        { id: "e", name: "Ontem", birthDate: "1985-10-20" },
      ],
      "2026-10-21",
      7,
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(rows[0]).toMatchObject({ daysLeft: 0, turns: 36 });
  });
});

describe("2.0-F6 — 2FA obrigatório", () => {
  it("só bloqueia equipe sem 2FA quando o escritório exige; cliente do portal nunca é bloqueado", () => {
    expect(mfaBlockedFor(true, "ASSISTANT", false)).toBe(true);
    expect(mfaBlockedFor(true, "ASSISTANT", true)).toBe(false);
    expect(mfaBlockedFor(false, "ASSISTANT", false)).toBe(false);
    expect(mfaBlockedFor(true, "CLIENT", false)).toBe(false);
  });
});

describe("2.0-F6 — planilha .xlsx", () => {
  it("gera um arquivo válido com cabeçalho, números como número e texto como texto (sem fórmula)", async () => {
    expect(colName(0)).toBe("A");
    expect(colName(25)).toBe("Z");
    expect(colName(26)).toBe("AA");
    const buf = await toXlsx("Clientes: teste/1", ["Nome", "Valor"], [["=HYPERLINK(\"http://x\")", 10.5], ["Ação & <b>", null]]);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]));
    const wb = await zip.file("xl/workbook.xml")!.async("string");
    expect(wb).toContain('name="Clientes  teste 1"');
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).not.toContain("<f>"); // nenhuma fórmula
    expect(sheet).toContain("<v>10.5</v>");
    expect(sheet).toContain("Ação &amp; &lt;b&gt;");
    expect(sheet).toContain('<autoFilter ref="A1:B3"/>');
    expect(sheet).toContain('state="frozen"');
  });
});

describe("2.0-F6 — texto do WhatsApp", () => {
  it("sugere textos com o primeiro nome e valida a mensagem", () => {
    expect(birthdayText("Maria da Silva", "Escritório Teste")).toContain("Olá, Maria!");
    expect(caseText("João Souza", "Escritório Teste", "1234567-89.2024.8.05.0001", { title: "Sentença publicada", date: "21/10/2026" })).toContain("A última movimentação foi em 21/10/2026: Sentença publicada.");
    expect(caseText("João Souza", "Escritório Teste", "Processo X", null)).not.toContain("última movimentação");
    expect(sendTextSchema.safeParse({ clientId: "x", text: "oi" }).success).toBe(false);
    expect(sendTextSchema.safeParse({ clientId: "7a1c0b1e-1b2c-4d3e-8f90-123456789abc", text: "a" }).success).toBe(false);
    expect(sendTextSchema.safeParse({ clientId: "7a1c0b1e-1b2c-4d3e-8f90-123456789abc", text: "Olá!" }).success).toBe(true);
  });
});
