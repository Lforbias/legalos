import "server-only";
import { notFound, redirect } from "next/navigation";
import { getRequestMeta, requireSession } from "@/server/session";
import { comAccessState, resolveComContext, type ComCtx } from "@/server/services/comercial.service";

/** Exige login + (super-admin ou equipe comercial ativa) + 2FA. Quem não tem acesso recebe 404 (a existência do painel não é revelada). */
export async function requireComercial(): Promise<{ cx: ComCtx; user: { id: string; name: string; email: string } }> {
  const session = await requireSession();
  const state = await comAccessState(session.user.id);
  if (state === "no_access") notFound();
  if (state === "needs_mfa") redirect("/conta?aviso=2fa-admin");
  const cx = await resolveComContext(session.user.id, await getRequestMeta());
  if (!cx) notFound();
  return { cx, user: { id: session.user.id, name: session.user.name, email: session.user.email } };
}
