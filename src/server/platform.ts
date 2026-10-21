import "server-only";
import { notFound, redirect } from "next/navigation";
import { getRequestMeta, requireSession } from "@/server/session";
import { platformAccessState, resolvePlatformContext, type PlatformCtx } from "@/server/services/platform.service";

/** Exige login + super-administrador + 2FA ativo. Quem não é admin recebe 404 (a existência do painel não é revelada). */
export async function requirePlatform(): Promise<{ pc: PlatformCtx; user: { id: string; name: string; email: string } }> {
  const session = await requireSession();
  const state = await platformAccessState(session.user.id);
  if (state === "not_admin") notFound();
  if (state === "needs_mfa") redirect("/conta?aviso=2fa-admin");
  const pc = await resolvePlatformContext(session.user.id, await getRequestMeta());
  if (!pc) notFound();
  return { pc, user: { id: session.user.id, name: session.user.name, email: session.user.email } };
}
