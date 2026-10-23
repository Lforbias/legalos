import { beforeAll, describe, expect, it } from "vitest";
import { allReadiness, getConnector, readinessOf } from "@/lib/connectors/registry";
import { COURT_SYSTEMS } from "@/lib/court-systems";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { assertConnectorFor, getReadinessReport, listSystemMap, setCourtSystem, systemForJtr } from "@/server/services/court-system-map.service";
import { db } from "@/lib/db/client";
import { addMember, makeOrgWithOwner } from "./helpers";

describe("3.0-F6 — sistema por tribunal e registro de conectores", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  beforeAll(async () => {
    A = await makeOrgWithOwner("l3f6-a");
    B = await makeOrgWithOwner("l3f6-b");
    assistant = await addMember(A.org.id, "ASSISTANT", "l3f6-ass");
  });

  it("registro: os sistemas têm adaptador MNI condicional e nenhum está validado em tribunal real", () => {
    expect(readinessOf("pje-mni").state).toBe("UNVALIDATED");
    for (const s of ["eproc", "esaj", "projudi"]) expect(readinessOf(s).state).toBe("UNVALIDATED");
    expect(readinessOf("xyz").state).toBe("UNKNOWN");
    expect(getConnector("pje-mni")?.capabilities).toContain("petition");
    expect(allReadiness()).toHaveLength(COURT_SYSTEMS.length);
    // coerência com o catálogo de sistemas (F6b)
    for (const s of COURT_SYSTEMS) expect(!!getConnector(s.key)).toBe(s.connector);
  });

  it("mapa exige integrations:manage, valida entrada e é por escritório", async () => {
    await expect(listSystemMap(assistant.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setCourtSystem(assistant.ctx, "8.05", "eproc")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setCourtSystem(A.ctx, "9.99", "eproc")).rejects.toBeInstanceOf(ValidationError);
    await expect(setCourtSystem(A.ctx, "8.05", "inexistente")).rejects.toBeInstanceOf(ValidationError);
    await setCourtSystem(A.ctx, "8.05", "eproc");
    expect(await systemForJtr(A.org.id, "8.05")).toBe("eproc");
    expect(await systemForJtr(B.org.id, "8.05")).toBeNull();
    await setCourtSystem(A.ctx, "8.05", "esaj"); // troca
    expect(await systemForJtr(A.org.id, "8.05")).toBe("esaj");
    expect(await db.courtSystemMap.count({ where: { organizationId: A.org.id, jtr: "8.05" } })).toBe(1);
    const row = (await listSystemMap(A.ctx)).find((r) => r.jtr === "8.05")!;
    expect(row.readiness?.state).toBe("UNVALIDATED");
    expect((await listSystemMap(B.ctx)).find((r) => r.jtr === "8.05")!.system).toBeNull();
  });

  it("recusa honesta quando o tribunal está em sistema sem conector; sem mapa não bloqueia", async () => {
    await expect(assertConnectorFor(A.org.id, "8.05", "petition")).rejects.toBeInstanceOf(ConflictError);
    await expect(assertConnectorFor(A.org.id, "8.05", "consult")).rejects.toThrow(/não tem conector/);
    await expect(assertConnectorFor(B.org.id, "8.05", "petition")).resolves.toBeUndefined();
    await expect(assertConnectorFor(A.org.id, null, "petition")).resolves.toBeUndefined();
    await setCourtSystem(A.ctx, "8.05", "pje-mni");
    await expect(assertConnectorFor(A.org.id, "8.05", "petition")).resolves.toBeUndefined();
  });

  it("limpar o mapa volta ao comportamento anterior e o relatório conta os bloqueios", async () => {
    await setCourtSystem(A.ctx, "8.05", "projudi");
    await setCourtSystem(A.ctx, "8.26", "pje-mni");
    const r = await getReadinessReport(A.ctx);
    expect(r.mapped).toBe(2);
    expect(r.blocked).toBe(2);
    await setCourtSystem(A.ctx, "8.05", null);
    expect(await systemForJtr(A.org.id, "8.05")).toBeNull();
    expect((await getReadinessReport(A.ctx)).blocked).toBe(1);
    await expect(assertConnectorFor(A.org.id, "8.05", "petition")).resolves.toBeUndefined();
  });

  it("conexão PJe/MNI ativa em tribunal mapeado para outro sistema é apontada", async () => {
    await db.courtConnection.create({ data: { organizationId: A.org.id, label: "TJBA", jtr: "8.05", endpointUrl: "https://exemplo.jus.br/mni", authMode: "PASSWORD", secretEnc: "x", createdById: A.ctx.userId } });
    expect((await getReadinessReport(A.ctx)).mniWithoutMap).toBe(1);
    await setCourtSystem(A.ctx, "8.05", "eproc");
    const r = await getReadinessReport(A.ctx);
    expect(r.mapConflict).toBe(1);
    expect(r.mniWithoutMap).toBe(0);
  });
});
