import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    robotJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    portalAccess: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logging/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/security/pfx", () => ({
  certKey: vi.fn(() => Buffer.from("test-key")),
  openBytes: vi.fn(() =>
    Buffer.from(JSON.stringify({ document: "12345678900", password: "test-pass", otpSecret: null })),
  ),
}));

vi.mock("@/server/job-runs", () => ({
  sanitizeError: vi.fn((e: unknown) => String(e).slice(0, 240)),
}));

vi.mock("@/server/services/audit.service", () => ({
  audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/judicial/evidence.service", () => ({
  recordEvidence: vi.fn(async () => ({ id: "ev-1" })),
}));

vi.mock("@/lib/judicial/adapter-bootstrap", () => ({
  ensureAdapters: vi.fn(),
  getAdapter: vi.fn(),
  registerAdapter: vi.fn(),
  findAdapterForCourt: vi.fn(),
  allSupportedTargets: vi.fn(() => []),
  listAdapters: vi.fn(() => []),
}));

import { db } from "@/lib/db/client";
import { certKey } from "@/lib/security/pfx";
import { getAdapter } from "@/lib/judicial/adapter-bootstrap";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { audit } from "@/server/services/audit.service";
import { runAdapterJob } from "@/server/robots/adapter-runner";
import type { TribunalAdapter, AdapterOutcome } from "@/lib/judicial/adapter";
import type { CourtDegree } from "@/lib/judicial/court-catalog";
import type { EvidenceEnvironment } from "@/lib/judicial/contracts";

function makeFakeAdapter(opts?: {
  key?: string;
  engineFamily?: string;
  validateResult?: AdapterOutcome<{ evidenceEnvironment: EvidenceEnvironment }>;
  targets?: { courtCode: string; degree: CourtDegree; label: string }[];
}): TribunalAdapter {
  return {
    descriptor: {
      key: opts?.key ?? "test-adapter",
      engineFamily: (opts?.engineFamily ?? "EPROC") as never,
      label: "Test Adapter",
      supportedAuthModes: ["PASSWORD"],
      capabilities: { validateCredentials: true },
      supportedTargets: opts?.targets ?? [
        { courtCode: "TST", degree: "1", label: "TST — 1º grau" },
        { courtCode: "TST", degree: "2", label: "TST — 2º grau" },
      ],
    },
    validateCredentials: vi.fn(async () =>
      opts?.validateResult ?? {
        ok: true as const,
        data: { evidenceEnvironment: "PRODUCTION" as const },
        message: "Conectado.",
      },
    ),
  };
}

function makeFakeJob(overrides?: Record<string, unknown>) {
  return {
    id: "job-1",
    kind: "LOGIN_TEST",
    status: "RUNNING",
    attempts: 0,
    access: {
      id: "access-1",
      organizationId: "org-1",
      userId: "user-1",
      system: "test-adapter",
      target: "tst-1g",
      authMethod: "PASSWORD",
      enabled: true,
      secretEnc: Buffer.from("encrypted"),
      user: { id: "user-1", name: "Advogado Teste" },
    },
    ...overrides,
  };
}

describe("adapter-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns SKIPPED when job not found", async () => {
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(null);
    const result = await runAdapterJob("missing-job");
    expect(result.status).toBe("SKIPPED");
  });

  it("returns SKIPPED when job status is not RUNNING", async () => {
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(makeFakeJob({ status: "DONE" }) as never);
    const result = await runAdapterJob("job-1");
    expect(result.status).toBe("SKIPPED");
  });

  it("marks FAILED when adapter not found", async () => {
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(makeFakeJob() as never);
    vi.mocked(getAdapter).mockReturnValue(undefined as never);
    vi.mocked(db.robotJob.update).mockResolvedValue({} as never);
    vi.mocked(db.portalAccess.update).mockResolvedValue({} as never);

    const result = await runAdapterJob("job-1");

    expect(result.status).toBe("FAILED");
    expect(db.robotJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("marks FAILED when access is disabled", async () => {
    const adapter = makeFakeAdapter();
    vi.mocked(getAdapter).mockReturnValue(adapter);
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(
      makeFakeJob({
        access: { ...makeFakeJob().access, enabled: false },
      }) as never,
    );
    vi.mocked(db.robotJob.update).mockResolvedValue({} as never);

    const result = await runAdapterJob("job-1");
    expect(result.status).toBe("FAILED");
  });

  it("marks FAILED when vault key is missing", async () => {
    const adapter = makeFakeAdapter();
    vi.mocked(getAdapter).mockReturnValue(adapter);
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(makeFakeJob() as never);
    vi.mocked(certKey).mockReturnValue(null as never);
    vi.mocked(db.robotJob.update).mockResolvedValue({} as never);
    vi.mocked(db.portalAccess.update).mockResolvedValue({} as never);

    const result = await runAdapterJob("job-1");
    expect(result.status).toBe("FAILED");
  });

  it("marks FAILED when target not found in adapter", async () => {
    const adapter = makeFakeAdapter({
      targets: [{ courtCode: "ABC", degree: "1", label: "ABC" }],
    });
    vi.mocked(getAdapter).mockReturnValue(adapter);
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(makeFakeJob() as never);
    vi.mocked(certKey).mockReturnValue(Buffer.from("key") as never);
    vi.mocked(db.robotJob.update).mockResolvedValue({} as never);
    vi.mocked(db.portalAccess.update).mockResolvedValue({} as never);

    const result = await runAdapterJob("job-1");
    expect(result.status).toBe("FAILED");
  });

  it("runs adapter successfully and marks DONE", async () => {
    const adapter = makeFakeAdapter();
    vi.mocked(getAdapter).mockReturnValue(adapter);
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(makeFakeJob() as never);
    vi.mocked(certKey).mockReturnValue(Buffer.from("key") as never);
    vi.mocked(db.robotJob.update).mockResolvedValue({} as never);
    vi.mocked(db.portalAccess.update).mockResolvedValue({} as never);
    vi.mocked(recordEvidence).mockResolvedValue({} as never);
    vi.mocked(audit).mockResolvedValue(undefined);

    const result = await runAdapterJob("job-1");

    expect(result.status).toBe("DONE");
    expect(adapter.validateCredentials).toHaveBeenCalled();
    expect(recordEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "PASSED", operation: "validateCredentials" }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "portal_access.login_ok" }),
    );
  });

  it("records failure evidence on adapter rejection", async () => {
    const adapter = makeFakeAdapter({
      validateResult: {
        ok: false,
        code: "BAD_CREDENTIALS",
        message: "Senha inválida.",
        retryable: false,
      },
    });
    vi.mocked(getAdapter).mockReturnValue(adapter);
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(makeFakeJob() as never);
    vi.mocked(certKey).mockReturnValue(Buffer.from("key") as never);
    vi.mocked(db.robotJob.update).mockResolvedValue({} as never);
    vi.mocked(db.portalAccess.update).mockResolvedValue({} as never);
    vi.mocked(recordEvidence).mockResolvedValue({} as never);
    vi.mocked(audit).mockResolvedValue(undefined);

    const result = await runAdapterJob("job-1");

    expect(result.status).toBe("WAITING_PERSON");
    expect(recordEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "FAILED", reasonCode: "AUTH_REJECTED" }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "portal_access.login_fail" }),
    );
  });

  it("does not open browser for non-PJE adapters", async () => {
    const adapter = makeFakeAdapter({ engineFamily: "EPROC" });
    vi.mocked(getAdapter).mockReturnValue(adapter);
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(makeFakeJob() as never);
    vi.mocked(certKey).mockReturnValue(Buffer.from("key") as never);
    vi.mocked(db.robotJob.update).mockResolvedValue({} as never);
    vi.mocked(db.portalAccess.update).mockResolvedValue({} as never);
    vi.mocked(recordEvidence).mockResolvedValue({} as never);
    vi.mocked(audit).mockResolvedValue(undefined);

    const openPage = vi.fn();
    await runAdapterJob("job-1", { openPage });

    expect(openPage).not.toHaveBeenCalled();
  });

  it("opens browser for PJE adapters", async () => {
    const adapter = makeFakeAdapter({ engineFamily: "PJE" });
    vi.mocked(getAdapter).mockReturnValue(adapter);
    vi.mocked(db.robotJob.findUnique).mockResolvedValue(makeFakeJob() as never);
    vi.mocked(certKey).mockReturnValue(Buffer.from("key") as never);
    vi.mocked(db.robotJob.update).mockResolvedValue({} as never);
    vi.mocked(db.portalAccess.update).mockResolvedValue({} as never);
    vi.mocked(recordEvidence).mockResolvedValue({} as never);
    vi.mocked(audit).mockResolvedValue(undefined);

    const mockPage = { page: {}, close: vi.fn(async () => undefined) };
    const openPage = vi.fn(async () => mockPage);
    await runAdapterJob("job-1", { openPage });

    expect(openPage).toHaveBeenCalled();
    expect(mockPage.close).toHaveBeenCalled();
  });
});
