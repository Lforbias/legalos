import { describe, expect, it } from "vitest";
import { RUN_HEARTBEAT_TIMEOUT_MIN, SOURCE_POLICIES, detectSilence, evaluateFreshness, evaluateJobFreshness, isRunInterrupted } from "@/lib/judicial/health-policy";

const now = new Date("2026-10-28T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("política de saúde por fonte (sem tolerância genérica)", () => {
  it("DJEN: atrasada com 90 min e crítica com 6 h sem sucesso", () => {
    const p = SOURCE_POLICIES.DJEN;
    const f = (min: number) => evaluateFreshness({ policy: p, enabled: true, createdAt: days(30), lastSuccessAt: ago(min), now }).level;
    expect(f(20)).toBe("OK");
    expect(f(91)).toBe("LATE");
    expect(f(6 * 60 + 1)).toBe("CRITICAL");
  });
  it("cada fonte tem tolerância própria: o mesmo atraso é crítico no DJEN e normal no DataJud", () => {
    const f = (k: keyof typeof SOURCE_POLICIES) => evaluateFreshness({ policy: SOURCE_POLICIES[k], enabled: true, createdAt: days(30), lastSuccessAt: ago(7 * 60), now }).level;
    expect(f("DJEN")).toBe("CRITICAL");
    expect(f("DATAJUD")).toBe("OK");
  });
  it("fonte nova que nunca sincronizou: espera um prazo curto e depois alerta (não fica 'ok' em silêncio)", () => {
    const p = SOURCE_POLICIES.DJEN;
    expect(evaluateFreshness({ policy: p, enabled: true, createdAt: ago(5), lastSuccessAt: null, now }).level).toBe("NEVER_WAITING");
    expect(evaluateFreshness({ policy: p, enabled: true, createdAt: ago(40), lastSuccessAt: null, now }).level).toBe("NEVER_LATE");
  });
  it("fonte desligada não gera alerta", () => {
    expect(evaluateFreshness({ policy: SOURCE_POLICIES.DJEN, enabled: false, createdAt: days(9), lastSuccessAt: null, now }).level).toBe("OFF");
  });
});

describe("silêncio suspeito: 'parece funcionar mas não entrega'", () => {
  const policy = SOURCE_POLICIES.DJEN;
  const weekly = Array.from({ length: 10 }, (_, i) => days(80 - i * 7)); // uma captura por semana
  it("sem histórico suficiente nunca alarma (escritório novo)", () => {
    expect(detectSilence({ captureTimes: [days(1), days(2)], lastCaptureAt: days(30), now, policy })).toMatchObject({ silent: false, reason: "NO_HISTORY" });
  });
  it("dentro do ritmo histórico não alarma", () => {
    expect(detectSilence({ captureTimes: weekly, lastCaptureAt: days(8), now, policy }).silent).toBe(false);
  });
  it("muito além do ritmo (e do mínimo da fonte) alarma", () => {
    const r = detectSilence({ captureTimes: weekly, lastCaptureAt: days(40), now, policy });
    expect(r.silent).toBe(true);
    expect(r.reason).toBe("SUSPICIOUS_SILENCE");
  });
  it("respeita o mínimo absoluto de dias da política", () => {
    const daily = Array.from({ length: 30 }, (_, i) => days(30 - i));
    expect(detectSilence({ captureTimes: daily, lastCaptureAt: days(6), now, policy }).silent).toBe(false); // 6 dias < mínimo de 10
    expect(detectSilence({ captureTimes: daily, lastCaptureAt: days(11), now, policy }).silent).toBe(true);
  });
});

describe("rotinas agendadas paradas", () => {
  it("rotina de 30 min: ok, atrasada, travada", () => {
    expect(evaluateJobFreshness({ everyMin: 30, lastStartedAt: ago(20), now }).level).toBe("OK");
    expect(evaluateJobFreshness({ everyMin: 30, lastStartedAt: ago(50), now }).level).toBe("LATE");
    expect(evaluateJobFreshness({ everyMin: 30, lastStartedAt: ago(95), now }).level).toBe("STALLED");
  });
  it("rotina que nunca rodou é atraso", () => {
    expect(evaluateJobFreshness({ everyMin: 30, lastStartedAt: null, now }).level).toBe("LATE");
  });
  it("execução sem sinal de vida é interrompida", () => {
    expect(isRunInterrupted(ago(RUN_HEARTBEAT_TIMEOUT_MIN - 1), now)).toBe(false);
    expect(isRunInterrupted(ago(RUN_HEARTBEAT_TIMEOUT_MIN + 1), now)).toBe(true);
  });
});
