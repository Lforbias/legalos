import { describe, expect, it, vi } from "vitest";
import { alertPayload, sendErrorAlert, shouldSend } from "@/lib/observability/alert";

describe("alerta de erro do servidor", () => {
  it("não inclui query string (pode ter dados) e limita repetição", () => {
    const p = alertPayload({ message: "falhou", path: "/clientes?cpf=123", method: "GET", digest: "abc" }, "piloto");
    expect(p.text).toContain("GET /clientes");
    expect(p.text).not.toContain("cpf=123");
    expect(shouldSend("k1", 0)).toBe(true);
    expect(shouldSend("k1", 1000)).toBe(false);
    expect(shouldSend("k1", 6 * 60_000)).toBe(true);
  });
  it("só envia para https e nunca lança", async () => {
    const f = vi.fn().mockRejectedValue(new Error("rede"));
    process.env.ALERT_WEBHOOK_URL = "http://inseguro";
    await sendErrorAlert({ message: "x", path: "/a", method: "GET" }, f as never);
    expect(f).not.toHaveBeenCalled();
    process.env.ALERT_WEBHOOK_URL = "https://hooks.exemplo.com/x";
    await expect(sendErrorAlert({ message: "y", path: "/b", method: "GET" }, f as never)).resolves.toBeUndefined();
    expect(f).toHaveBeenCalledTimes(1);
    delete process.env.ALERT_WEBHOOK_URL;
  });
});
