import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { encryptSecret } from "@/lib/security/totp";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { createCase, listCaseEvents } from "@/server/services/case.service";
import { syncLegalMailHistory } from "@/server/services/legalmail-history.service";
import { makeOrgWithOwner } from "./helpers";

vi.unmock("@/lib/box-retirement");
afterEach(() => vi.unstubAllEnvs());

it("imports text movements from the matching process once and ignores documents", async () => {
  const office = await makeOrgWithOwner("legalmail-history");
  const vault = Buffer.alloc(32, 17);
  vi.stubEnv("MFA_ENCRYPTION_KEY", vault.toString("base64"));
  vi.stubEnv("LEGALMAIL_ORGANIZATION_ID", office.org.id);
  await db.$executeRaw`
    INSERT INTO legalmail_pilot (organization_id, api_key_enc)
    VALUES (${office.org.id}::uuid, ${encryptSecret("fictional-test-key", vault)})
    ON CONFLICT (singleton) DO UPDATE SET organization_id = EXCLUDED.organization_id, api_key_enc = EXCLUDED.api_key_enc
  `;
  const check = computeCnjCheck({ sequence: "0009002", year: "2024", segment: "8", court: "26", origin: "0100" });
  const number = `0009002-${check}.2024.8.26.0100`;
  const row = await createCase(office.ctx, {
    number, legacyNumber: "", title: "Processo de teste", area: "", court: "TJSP", courtUnit: "",
    courtState: "SP", subject: "", claimValue: "", status: "ACTIVE", phase: "", distributedAt: "",
    confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF",
  });
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    expect(url.hostname).toBe("api.legalmail.com.br");
    if (url.pathname.endsWith("/all")) {
      return Response.json([{ idprocessos: 456, numero_processo: number.replace(/\D/g, "") }]);
    }
    expect(url.searchParams.get("idprocessos")).toBe("456");
    return Response.json([
      { idmovimentacoes: 57, fk_processo: 456, titulo: "Movimentação", tipo: "movimentacao", data_movimentacao: "2026-11-09", texto: "Conclusos para despacho." },
      { idmovimentacoes: 58, fk_processo: 456, titulo: "Anexo", tipo: "anexo", data_movimentacao: "2026-11-09" },
      { idmovimentacoes: 59, fk_processo: 789, titulo: "Outro processo", tipo: "movimentacao", data_movimentacao: "2026-11-09" },
    ]);
  });

  try {
    expect(await syncLegalMailHistory(office.ctx, row.id, fetcher)).toEqual({ found: true, total: 1, imported: 1 });
    expect(await syncLegalMailHistory(office.ctx, row.id, fetcher)).toEqual({ found: true, total: 1, imported: 0 });
    expect(await listCaseEvents(office.ctx, row.id, "IMPORTED")).toMatchObject([
      { kind: "LEGALMAIL_MOVEMENT", description: "Conclusos para despacho.", externalKey: "legalmail:57" },
    ]);
  } finally {
    await db.$executeRaw`DELETE FROM legalmail_pilot WHERE organization_id = ${office.org.id}::uuid`;
  }
});
