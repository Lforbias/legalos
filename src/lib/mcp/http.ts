import { appUrl } from "@/server/services/auth.service";

export const issuer = () => appUrl("");
export const mcpUrl = () => appUrl("/api/mcp");
export const resourceMetadataUrl = () => appUrl("/.well-known/oauth-protected-resource/api/mcp");

export const protectedResourceMetadata = () => ({
  resource: mcpUrl(),
  authorization_servers: [issuer()],
  bearer_methods_supported: ["header"],
  scopes_supported: ["mcp:read", "mcp:propose"],
  resource_name: "LegalOS — RUTE",
});

export const authServerMetadata = () => ({
  issuer: issuer(),
  authorization_endpoint: appUrl("/oauth/authorize"),
  token_endpoint: appUrl("/api/oauth/token"),
  registration_endpoint: appUrl("/api/oauth/register"),
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["mcp:read", "mcp:propose"],
});

export const META_HEADERS = { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } as const;

/** Origens de navegador aceitas (proteção contra DNS rebinding). Chamadas servidor-a-servidor não enviam Origin. */
export function originAllowed(origin: string | null): boolean {
  if (!origin) return true;
  const ok = ["https://claude.ai", "https://claude.com", "https://chatgpt.com", "https://chat.openai.com", "https://gemini.google.com", new URL(appUrl("")).origin];
  return ok.includes(origin);
}
