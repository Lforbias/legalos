import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Este arquivo roda com o comportamento REAL de produção: módulo judicial (Box) desligado.
// O setup-env.ts liga o Box só para os testes históricos do código legado; aqui o mock é desfeito.
vi.unmock("@/lib/box-retirement");

import { db } from "@/lib/db/client";
import { BOX_AVAILABLE } from "@/lib/box-retirement";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { listClientCredentials, saveClientCredential } from "@/server/services/client-vault.service";
import { deleteMonitor } from "@/server/services/djen.service";
import { makeOrgWithOwner, META } from "./helpers";

const saved = { ...process.env };

describe("MVP — funções que não podem depender do módulo judicial desligado", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let clientId: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    A = await makeOrgWithOwner("mvp-boxoff");
    clientId = (await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Cliente MVP" } })).id;
    const s = await startEnrollment(A.owner.id, A.owner.email);
    await confirmEnrollment(A.owner.id, totpCode(s.secret, totpStep()), META);
  });
  afterAll(async () => {
    await db.clientCredential.deleteMany({ where: { organizationId: A.org.id } });
    process.env = { ...saved };
  });

  it("o Box está realmente desligado neste arquivo", () => {
    expect(BOX_AVAILABLE).toBe(false);
  });

  it("cofre de senhas dos clientes salva credencial com o Box desligado", async () => {
    await saveClientCredential(A.ctx, clientId, null, { system: "Meu INSS", label: "titular", login: "123", password: "segredo" });
    const list = await listClientCredentials(A.ctx, clientId);
    expect(list).toHaveLength(1);
  });

  it("remover monitoramento DJEN funciona com o Box desligado", async () => {
    const m = await db.djenMonitor.create({ data: { organizationId: A.org.id, label: "OAB", oabNumber: "123456", oabUf: "SP", createdById: A.owner.id } });
    await deleteMonitor(A.ctx, m.id);
    expect(await db.djenMonitor.count({ where: { id: m.id } })).toBe(0);
  });
});
