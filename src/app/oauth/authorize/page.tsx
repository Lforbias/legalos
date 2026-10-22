import type { Metadata } from "next";
import { Brand } from "@/components/layout/brand";
import { Alert } from "@/components/ui/alert";
import { can } from "@/server/context";
import { OAuthConsent } from "@/modules/rute/oauth-consent";
import { getClient, MCP_SCOPES, parseScopes, OAuthError } from "@/server/services/mcp-auth.service";
import { getRuteSettings } from "@/server/services/rute-settings.service";
import { requireTenant } from "@/server/session";
import { db } from "@/lib/db/client";

export const metadata: Metadata = { title: "Conectar IA ao LegalOS", robots: { index: false } };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6">
        <Brand />
      </div>
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-xl shadow-black/20">{children}</div>
    </main>
  );
}

/** Tela de consentimento OAuth. Nunca redireciona para endereço não cadastrado: erros aparecem aqui. */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { ctx, organization } = await requireTenant();
  const clientId = one(sp.client_id) ?? "";
  const redirectUri = one(sp.redirect_uri) ?? "";
  const challenge = one(sp.code_challenge) ?? "";
  const client = await getClient(clientId);
  const bad = (msg: string) => (
    <Shell>
      <h1 className="text-lg font-semibold">Não foi possível conectar</h1>
      <Alert tone="error">{msg}</Alert>
    </Shell>
  );
  if (!client || !client.redirectUris.includes(redirectUri)) return bad("Aplicativo ou endereço de retorno não reconhecido. Volte ao aplicativo de IA e tente de novo.");
  if (one(sp.response_type) !== "code" || one(sp.code_challenge_method) !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return bad("Pedido de conexão inválido (falta a verificação PKCE).");
  let scopes;
  try {
    scopes = parseScopes(one(sp.scope));
  } catch (e) {
    return bad(e instanceof OAuthError ? e.message : "Acesso inválido.");
  }
  if (!can(ctx, "ai:use")) return bad("Seu perfil não tem acesso aos recursos de IA. Peça a quem administra o escritório.");
  const settings = await getRuteSettings(ctx);
  if (!settings.mcpEnabled || settings.emergencyStop) return bad("A conexão de IAs externas está desligada neste escritório. Quem administra as integrações liga em RUTE → Situação.");
  const mfa = await db.userMfa.findUnique({ where: { userId: ctx.userId }, select: { enabledAt: true } });
  if (!mfa?.enabledAt) return bad("Ative a verificação em duas etapas em Minha conta antes de conectar uma IA.");

  return (
    <Shell>
      <h1 className="text-lg font-semibold">Conectar “{client.name}” ao LegalOS</h1>
      <p className="text-sm text-muted">
        Escritório: <strong>{organization.name}</strong>. A IA vai agir como você, com as suas permissões e o seu sigilo. Ela só consulta e propõe: nada é criado, alterado ou enviado sem a sua confirmação aqui no LegalOS. CPF, CNPJ e e-mails são ocultados.
      </p>
      <OAuthConsent
        key={clientId + challenge}
        clientId={clientId}
        redirectUri={redirectUri}
        codeChallenge={challenge}
        state={one(sp.state)}
        scopes={scopes.map((k) => ({ key: k, label: MCP_SCOPES[k] }))}
      />
      <p className="text-xs text-muted">Você pode revogar a conexão a qualquer momento em RUTE → Conexões.</p>
    </Shell>
  );
}
