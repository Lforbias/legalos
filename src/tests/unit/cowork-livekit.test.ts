import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accessToken, liveKitConfig, liveKitCspOrigins, roomName, signJwt, verifyJwt, verifyWebhook } from "@/server/cowork/livekit";

const SECRET = "s".repeat(40);
const env = { LIVEKIT_URL: "wss://video.exemplo.com.br", LIVEKIT_API_KEY: "APIkey123", LIVEKIT_API_SECRET: SECRET, COWORK_VIDEO_ENABLED: "1" } as unknown as NodeJS.ProcessEnv;

describe("LiveKit — configuração", () => {
  it("fica desligado sem todas as variáveis e sem a confirmação do operador", () => {
    expect(liveKitConfig({} as unknown as NodeJS.ProcessEnv).ok).toBe(false);
    const noFlag = liveKitConfig({ ...env, COWORK_VIDEO_ENABLED: "" });
    expect(noFlag.ok).toBe(false);
    if (!noFlag.ok) expect(noFlag.missing.join()).toContain("COWORK_VIDEO_ENABLED");
    expect(liveKitConfig({ ...env, LIVEKIT_URL: "ws://video.exemplo.com.br" }).ok).toBe(false); // sem TLS fora de localhost
    expect(liveKitConfig({ ...env, LIVEKIT_API_SECRET: "curto" }).ok).toBe(false);
    expect(liveKitConfig({ ...env, LIVEKIT_URL: "ws://localhost:7880" }).ok).toBe(true);
  });
  it("libera no CSP apenas a origem do servidor de vídeo", () => {
    expect(liveKitCspOrigins(env)).toEqual(["wss://video.exemplo.com.br", "https://video.exemplo.com.br"]);
    expect(liveKitCspOrigins({} as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe("LiveKit — token e webhook", () => {
  const c = liveKitConfig(env);
  if (!c.ok) throw new Error("config");
  it("token assinado com a secret, identidade, sala e permissões; expira", () => {
    const now = Date.UTC(2030, 0, 1);
    const t = accessToken(c.config, { identity: "u1", name: "Ana", grant: { room: "r1", roomJoin: true, roomAdmin: false } }, now);
    const claims = verifyJwt(t, SECRET, now)!;
    expect(claims).toMatchObject({ iss: "APIkey123", sub: "u1", name: "Ana", video: { room: "r1", roomJoin: true, roomAdmin: false } });
    expect(verifyJwt(t, "x".repeat(40), now)).toBeNull();
    expect(verifyJwt(t, SECRET, now + 3600_000)).toBeNull();
    const [h, , sig] = t.split(".");
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, video: { room: "r1", roomAdmin: true } })).toString("base64url")}.${sig}`;
    expect(verifyJwt(forged, SECRET, now)).toBeNull();
  });
  it("webhook só é aceito com assinatura válida e corpo íntegro", () => {
    const body = JSON.stringify({ event: "participant_joined", room: { name: "cw_x" }, participant: { identity: "u1" } });
    const auth = signJwt({ iss: "APIkey123", sha256: createHash("sha256").update(body).digest("base64"), exp: Math.floor(Date.now() / 1000) + 60 }, SECRET);
    expect(verifyWebhook(c.config, body, auth)?.event).toBe("participant_joined");
    expect(verifyWebhook(c.config, body.replace("u1", "u2"), auth)).toBeNull();
    expect(verifyWebhook(c.config, body, null)).toBeNull();
    expect(verifyWebhook(c.config, body, signJwt({ iss: "outra", sha256: createHash("sha256").update(body).digest("base64") }, SECRET))).toBeNull();
  });
  it("nome da sala é opaco (sem título nem processo)", () => {
    const name = roomName("11111111-2222-3333-4444-555555555555", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(name).toBe("cw_111111112222_aaaaaaaabbbbccccddddeeeeeeeeeeee");
  });
});
