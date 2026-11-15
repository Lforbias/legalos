import { describe, expect, it } from "vitest";
import { mapAdapterOutcome, backoffMs, type AdapterOutcome } from "@/lib/judicial/adapter";

describe("mapAdapterOutcome", () => {
  it("maps successful outcome to CONNECTED/DONE", () => {
    const outcome: AdapterOutcome<unknown> = { ok: true, data: {}, message: "OK" };
    const result = mapAdapterOutcome(outcome, 0);
    expect(result.accessStatus).toBe("CONNECTED");
    expect(result.jobStatus).toBe("DONE");
  });

  it("retries retryable failure under max attempts", () => {
    const outcome: AdapterOutcome<unknown> = { ok: false, code: "TIMEOUT", message: "timeout", retryable: true };
    const result = mapAdapterOutcome(outcome, 1);
    expect(result.accessStatus).toBe("CONNECTING");
    expect(result.jobStatus).toBe("QUEUED");
    expect(result.retry).toBe(true);
  });

  it("fails retryable after max attempts", () => {
    const outcome: AdapterOutcome<unknown> = { ok: false, code: "NETWORK", message: "rede", retryable: true };
    const result = mapAdapterOutcome(outcome, 3);
    expect(result.accessStatus).toBe("ERROR");
    expect(result.jobStatus).toBe("FAILED");
  });

  it("disables on ACCOUNT_BLOCKED", () => {
    const outcome: AdapterOutcome<unknown> = { ok: false, code: "ACCOUNT_BLOCKED", message: "bloqueado", retryable: false };
    const result = mapAdapterOutcome(outcome, 0);
    expect(result.accessStatus).toBe("NEEDS_ACTION");
    expect(result.jobStatus).toBe("WAITING_PERSON");
    expect(result.disable).toBe(true);
  });

  it("returns ERROR for UNKNOWN_PAGE", () => {
    const outcome: AdapterOutcome<unknown> = { ok: false, code: "UNKNOWN_PAGE", message: "tela desconhecida", retryable: false };
    const result = mapAdapterOutcome(outcome, 0);
    expect(result.accessStatus).toBe("ERROR");
    expect(result.jobStatus).toBe("FAILED");
  });

  it("returns NEEDS_ACTION for CAPTCHA", () => {
    const outcome: AdapterOutcome<unknown> = { ok: false, code: "CAPTCHA", message: "captcha", retryable: false };
    const result = mapAdapterOutcome(outcome, 0);
    expect(result.accessStatus).toBe("NEEDS_ACTION");
    expect(result.jobStatus).toBe("WAITING_PERSON");
  });

  it("returns NEEDS_ACTION for OTP_REQUIRED", () => {
    const outcome: AdapterOutcome<unknown> = { ok: false, code: "OTP_REQUIRED", message: "2FA", retryable: false };
    const result = mapAdapterOutcome(outcome, 0);
    expect(result.accessStatus).toBe("NEEDS_ACTION");
    expect(result.jobStatus).toBe("WAITING_PERSON");
  });

  it("returns NEEDS_ACTION for CERTIFICATE_REQUIRED", () => {
    const outcome: AdapterOutcome<unknown> = { ok: false, code: "CERTIFICATE_REQUIRED", message: "cert", retryable: false };
    const result = mapAdapterOutcome(outcome, 0);
    expect(result.accessStatus).toBe("NEEDS_ACTION");
    expect(result.jobStatus).toBe("WAITING_PERSON");
  });

  it("returns ERROR for LAYOUT_CHANGED", () => {
    const outcome: AdapterOutcome<unknown> = { ok: false, code: "LAYOUT_CHANGED", message: "mudou", retryable: false };
    const result = mapAdapterOutcome(outcome, 0);
    expect(result.accessStatus).toBe("ERROR");
    expect(result.jobStatus).toBe("FAILED");
  });
});

describe("backoffMs", () => {
  it("exponential backoff capped at 30 min", () => {
    expect(backoffMs(0)).toBe(60_000);
    expect(backoffMs(1)).toBe(120_000);
    expect(backoffMs(2)).toBe(240_000);
    expect(backoffMs(5)).toBe(1_800_000);
    expect(backoffMs(10)).toBe(1_800_000);
  });
});
