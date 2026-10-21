import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePfx, sealBytes, openBytes } from "@/lib/security/pfx";
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
      expect(parsePfx(readFileSync(path.join(dir, "modern.pfx")), "abc123").subjectCn).toBe("TESTE:12345678909");
      try {
        run("pkcs12", "-export", "-legacy", "-inkey", "k.pem", "-in", "c.pem", "-out", "legacy.pfx", "-passout", "pass:abc123");
        expect(parsePfx(readFileSync(path.join(dir, "legacy.pfx")), "abc123").subjectCn).toBe("TESTE:12345678909");
      } catch (e) {
        if (!(e as { stderr?: Buffer }).stderr?.toString().includes("legacy")) throw e; // OpenSSL 1.x não tem -legacy
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
