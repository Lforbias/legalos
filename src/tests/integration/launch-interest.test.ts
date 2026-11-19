import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { INTEREST_TAG, interestSchema } from "@/lib/launch";
import { interestRows, registerInterest } from "@/server/services/launch-interest.service";
import { META } from "./helpers";

describe("lista de interesse do lançamento", () => {
  it("vira escritório no LegalOS Comercial, com contato e aceite, sem duplicar pelo e-mail", async () => {
    const email = `interesse-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const input = interestSchema.parse({ name: "Pessoa Interessada", office: "Escritório Teste", email, whatsapp: "11999990000", consent: true });
    expect(await registerInterest(input, META)).toEqual({ created: true });
    expect(await registerInterest({ ...input, office: null }, META)).toEqual({ created: false });

    const rows = await db.comProspect.findMany({ where: { email, deletedAt: null }, include: { contacts: true, activities: true } });
    expect(rows).toHaveLength(1);
    const p = rows[0]!;
    expect(p).toMatchObject({ name: "Escritório Teste", stage: "IDENTIFICADO", whatsapp: "11999990000", ownerId: null });
    expect(p.tags).toContain(INTEREST_TAG);
    expect(p.contacts.map((c) => c.name)).toEqual(["Pessoa Interessada"]);
    expect(p.activities).toHaveLength(2);
    expect(p.notes).toMatch(/Aceite registrado em/);

    const csv = await interestRows();
    expect(csv.some((r) => r[3] === email && r[1] === "Pessoa Interessada")).toBe(true);
  });
});
