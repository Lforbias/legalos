import "server-only";
import { NextResponse } from "next/server";
import type { TenantContext } from "@/server/context";
import { coworkAvailability } from "@/server/services/cowork-access.service";
import { getTenant } from "@/server/session";

/** Autentica rotas do Cowork: sessão válida + acesso ao Cowork. Devolve o contexto ou a resposta de erro. */
export async function coworkRouteContext(): Promise<{ ctx: TenantContext } | { error: NextResponse }> {
  const tenant = await getTenant();
  if (!tenant) return { error: NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) };
  if (tenant.ctx.roleKey === "CLIENT") return { error: NextResponse.json({ error: "Acesso negado." }, { status: 403 }) };
  const a = await coworkAvailability(tenant.ctx);
  if (!a.ok) return { error: NextResponse.json({ error: "O Cowork não está disponível para você neste escritório." }, { status: 403 }) };
  return { ctx: tenant.ctx };
}

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;
