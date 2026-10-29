import { describe, expect, it } from "vitest";
import { certificateAlerts, jobAlert, sourceAlerts, worstSeverity, type SourceAlertInput } from "@/lib/judicial/alerts";

const base: SourceAlertInput = { kind: "DJEN", id: "m1", label: "Dra. Talita", enabled: true, freshness: "OK", minutesSinceSuccess: 10, lastStatus: "OK", lastMessage: null, consecutiveFailures: 0, silence: null, interruptedRun: false, unverified: false };
const now = new Date("2026-10-28T12:00:00Z");
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("alertas por fonte", () => {
  it("fonte saudável não gera alerta; desligada nunca alerta", () => {
    expect(sourceAlerts(base)).toEqual([]);
    expect(sourceAlerts({ ...base, enabled: false, freshness: "CRITICAL", consecutiveFailures: 9 })).toEqual([]);
  });
  it("atrasada = aviso; parada = crítico; a mensagem fala do que o advogado perde, sem jargão", () => {
    const late = sourceAlerts({ ...base, freshness: "LATE", minutesSinceSuccess: 120 });
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ severity: "WARNING", code: "SOURCE_STALE", dedupeKey: "SOURCE_STALE:DJEN:m1" });
    const crit = sourceAlerts({ ...base, freshness: "CRITICAL", minutesSinceSuccess: 600 });
    expect(crit[0]).toMatchObject({ severity: "CRITICAL" });
    expect(crit[0]!.body).toMatch(/podem não estar chegando/);
    for (const a of [...late, ...crit]) expect(`${a.title} ${a.body}`).not.toMatch(/SOAP|WSDL|endpoint|HTTP|token/i);
  });
  it("falhas repetidas só alertam a partir do limite da fonte (3 no DJEN)", () => {
    expect(sourceAlerts({ ...base, consecutiveFailures: 2 })).toEqual([]);
    const a = sourceAlerts({ ...base, consecutiveFailures: 3, lastMessage: "O DJEN está instável." });
    expect(a[0]).toMatchObject({ code: "SOURCE_FAILING", severity: "WARNING" });
    expect(a[0]!.body).toContain("instável");
    expect(a[0]!.details).toMatchObject({ consecutiveFailures: 3 });
  });
  it("fonte nova sem a primeira consulta alerta depois da carência", () => {
    expect(sourceAlerts({ ...base, freshness: "NEVER_WAITING", minutesSinceSuccess: 5 })).toEqual([]);
    expect(sourceAlerts({ ...base, freshness: "NEVER_LATE", minutesSinceSuccess: 50 })[0]).toMatchObject({ code: "SOURCE_NEVER_SYNCED" });
  });
  it("silêncio suspeito: funciona mas não entrega", () => {
    const a = sourceAlerts({ ...base, silence: { silent: true, daysSinceLast: 40, typicalGapDays: 7 } });
    expect(a[0]).toMatchObject({ code: "SOURCE_SILENT", severity: "WARNING" });
    expect(a[0]!.title).toContain("40 dias");
    expect(sourceAlerts({ ...base, silence: { silent: false, daysSinceLast: 3, typicalGapDays: 7 } })).toEqual([]);
  });
  it("execução interrompida é só informativa; fonte sem verificação real é informativa e só quando está em dia", () => {
    expect(sourceAlerts({ ...base, interruptedRun: true })[0]).toMatchObject({ code: "RUN_INTERRUPTED", severity: "INFO" });
    expect(sourceAlerts({ ...base, unverified: true })[0]).toMatchObject({ code: "SOURCE_UNVERIFIED", severity: "INFO" });
    expect(sourceAlerts({ ...base, unverified: true, freshness: "LATE", minutesSinceSuccess: 200 }).some((x) => x.code === "SOURCE_UNVERIFIED")).toBe(false);
  });
  it("a chave de deduplicação é estável por fonte e problema", () => {
    const a = sourceAlerts({ ...base, freshness: "LATE", minutesSinceSuccess: 100 })[0]!.dedupeKey;
    const b = sourceAlerts({ ...base, freshness: "CRITICAL", minutesSinceSuccess: 700 })[0]!.dedupeKey;
    expect(a).toBe(b); // o mesmo alerta escala de aviso para crítico; não vira dois
    expect(sourceAlerts({ ...base, id: "m2", freshness: "LATE", minutesSinceSuccess: 100 })[0]!.dedupeKey).not.toBe(a);
  });
});

describe("validade do certificado", () => {
  const c = { id: "c1", label: "A1 Talita", revokedAt: null };
  it("sem alerta com mais de 30 dias; informa com 30, avisa com 15, é crítico com 7 e vencido", () => {
    expect(certificateAlerts({ ...c, notAfter: inDays(45) }, now)).toEqual([]);
    expect(certificateAlerts({ ...c, notAfter: inDays(25) }, now)[0]).toMatchObject({ severity: "INFO" });
    expect(certificateAlerts({ ...c, notAfter: inDays(12) }, now)[0]).toMatchObject({ severity: "WARNING" });
    expect(certificateAlerts({ ...c, notAfter: inDays(3) }, now)[0]).toMatchObject({ severity: "CRITICAL" });
    const expired = certificateAlerts({ ...c, notAfter: inDays(-2) }, now)[0]!;
    expect(expired).toMatchObject({ severity: "CRITICAL" });
    expect(expired.title).toMatch(/venceu há 2 dia/);
  });
  it("certificado revogado não alerta", () => {
    expect(certificateAlerts({ ...c, notAfter: inDays(1), revokedAt: now }, now)).toEqual([]);
  });
  it("o alerta não carrega senha nem material do certificado", () => {
    const a = certificateAlerts({ ...c, notAfter: inDays(3) }, now)[0]!;
    expect(JSON.stringify(a)).not.toMatch(/pfx|senha|password|passphrase/i);
  });
});

describe("rotinas agendadas", () => {
  it("em dia não alerta; atrasada avisa; parada é crítica", () => {
    expect(jobAlert({ key: "djen", label: "Captura do DJEN", level: "OK", minutesLate: 0 })).toEqual([]);
    expect(jobAlert({ key: "djen", label: "Captura do DJEN", level: "LATE", minutesLate: 20 })[0]).toMatchObject({ severity: "WARNING", dedupeKey: "JOB_LATE:djen" });
    expect(jobAlert({ key: "djen", label: "Captura do DJEN", level: "STALLED", minutesLate: 70 })[0]).toMatchObject({ severity: "CRITICAL" });
  });
  it("gravidade do conjunto", () => {
    expect(worstSeverity([])).toBe("OK");
    expect(worstSeverity([{ severity: "INFO" }, { severity: "CRITICAL" }, { severity: "WARNING" }])).toBe("CRITICAL");
  });
});

describe("ação humana e frase da fonte", () => {
  it("quando só a pessoa resolve, vira 'precisa da sua ação' (e não 'falhando repetidamente')", () => {
    const a = sourceAlerts({ ...base, kind: "PORTAL", needsAction: "O PJe recusou a senha. Atualize o acesso.", consecutiveFailures: 5 });
    expect(a.map((x) => x.code)).toEqual(["SOURCE_NEEDS_ACTION"]);
    expect(a[0]!.body).toContain("recusou");
  });
  it("frase em linguagem simples", async () => {
    const { sourceHeadline } = await import("@/lib/judicial/alerts");
    expect(sourceHeadline({ ...base, enabled: false, lastCaptureAt: null })).toBe("Desligado.");
    expect(sourceHeadline({ ...base, freshness: "CRITICAL", minutesSinceSuccess: 800, lastCaptureAt: null })).toMatch(/^Parado/);
    expect(sourceHeadline({ ...base, lastCaptureAt: null })).toMatch(/Nenhuma publicação nova/);
    // consulta respondeu mas sem prova real: nunca afirma "Em dia"
    expect(sourceHeadline({ ...base, unverified: true, lastCaptureAt: null })).toMatch(/ainda não há uma verificação real/);
    expect(sourceHeadline({ ...base, lastCaptureAt: new Date("2026-10-20T12:00:00Z") })).toMatch(/20\/10\/2026/);
  });
});
