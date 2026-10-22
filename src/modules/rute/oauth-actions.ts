"use server";

import { z } from "zod";
import { ValidationError } from "@/lib/permissions/check";
import type { ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { createAuthCode, getClient, MCP_SCOPE_LIST, type McpScope } from "@/server/services/mcp-auth.service";
import { requireTenant } from "@/server/session";

const schema = z.object({
  clientId: z.string().max(100),
  redirectUri: z.string().max(500),
  codeChallenge: z.string().max(100),
  state: z.string().max(500).optional(),
  scopes: z.array(z.enum(MCP_SCOPE_LIST as [string, ...string[]])).min(1, "Escolha ao menos um acesso."),
  allow: z.boolean(),
});

/** Decide a autorização e devolve o endereço para onde o navegador deve voltar (o redirecionamento é feito no cliente). */
export async function decideAuthorizationAction(input: z.input<typeof schema>): Promise<ActionState<{ redirect: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(schema, input);
    const client = await getClient(v.clientId);
    if (!client || !client.redirectUris.includes(v.redirectUri)) throw new ValidationError("Aplicativo ou endereço de retorno não reconhecido.");
    const back = new URL(v.redirectUri);
    if (!v.allow) {
      back.searchParams.set("error", "access_denied");
    } else {
      const { code } = await createAuthCode(ctx, { clientId: v.clientId, redirectUri: v.redirectUri, codeChallenge: v.codeChallenge, scopes: v.scopes as McpScope[] });
      back.searchParams.set("code", code);
    }
    if (v.state) back.searchParams.set("state", v.state);
    return { redirect: back.toString() };
  });
}
