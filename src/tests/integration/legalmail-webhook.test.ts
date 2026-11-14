import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/legalmail/route";

describe("LegalMail judicial webhook retired", () => {
  it("rejects old inbound delivery without processing or storing content", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: "box_removed" });
  });
});
