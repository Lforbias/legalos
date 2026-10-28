import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSecureContext } from "node:tls";
import { pfxForTls, parsePfx, sealBytes, openBytes } from "@/lib/security/pfx";
import { makeTestPfx } from "../fixtures/make-pfx";

const hasOpenssl = (() => {
  try {
    execFileSync("openssl", ["version"]);
    return true;
  } catch {
    return false;
  }
})();

describe("leitura de certificado A1 (.pfx)", () => {
  it("extrai titular, validade, impressão digital e mascara o CPF", () => {
    const i = parsePfx(makeTestPfx({ password: "s3nha", cn: "FULANA DE TAL:12345678909" }), "s3nha");
    expect(i.subjectCn).toBe("FULANA DE TAL:12345678909");
    expect(i.documentHint).toBe("***.456.789-**");
    expect(i.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(i.notAfter.getTime()).toBeGreaterThan(Date.now());
  });
  it("prepara A1 sintético em memória para TLS sem alterar o original e recusa senha errada", () => {
    const original = makeTestPfx({ password: "test-123" }); const before = Buffer.from(original);
    const normalized = pfxForTls(original, "test-123");
    expect(original.equals(before)).toBe(true);
    expect(parsePfx(normalized, "test-123").fingerprintSha256).toBe(parsePfx(original, "test-123").fingerprintSha256);
    expect(() => createSecureContext({ pfx: normalized, passphrase: "test-123" })).not.toThrow();
    expect(() => pfxForTls(original, "errada")).toThrow();
  });
  it("cifra e decifra bytes; chave errada falha", () => {
    const key = Buffer.alloc(32, 4);
    const sealed = sealBytes(Buffer.from([1, 2, 3, 250]), key);
    expect([...openBytes(sealed, key)]).toEqual([1, 2, 3, 250]);
    expect(() => openBytes(sealed, Buffer.alloc(32, 5))).toThrow();
  });
  it.skipIf(!hasOpenssl)("lê .pfx gerado pelo OpenSSL (moderno e legado)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pfx-"));
    try {
      const run = (...a: string[]) => execFileSync("openssl", a, { cwd: dir, stdio: "pipe" });
      run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "k.pem", "-out", "c.pem", "-days", "30", "-subj", "/CN=TESTE:12345678909");
      run("pkcs12", "-export", "-inkey", "k.pem", "-in", "c.pem", "-out", "modern.pfx", "-passout", "pass:abc123");
      const original = readFileSync(path.join(dir, "modern.pfx"));
      expect(parsePfx(original, "abc123").subjectCn).toBe("TESTE:12345678909");
      expect(() => createSecureContext({ pfx: pfxForTls(original, "abc123"), passphrase: "abc123" })).not.toThrow();
      try {
        run("pkcs12", "-export", "-legacy", "-inkey", "k.pem", "-in", "c.pem", "-out", "legacy.pfx", "-passout", "pass:abc123");
        const legacy = readFileSync(path.join(dir, "legacy.pfx"));
        const before = Buffer.from(legacy);
        const normalized = pfxForTls(legacy, "abc123");
        expect(parsePfx(normalized, "abc123").fingerprintSha256).toBe(parsePfx(legacy, "abc123").fingerprintSha256);
        expect(legacy.equals(before)).toBe(true);
        expect(() => createSecureContext({ pfx: normalized, passphrase: "abc123" })).not.toThrow();
      } catch (e) {
        if (!(e as { stderr?: Buffer }).stderr?.toString().includes("legacy")) throw e; // OpenSSL 1.x não tem -legacy
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
