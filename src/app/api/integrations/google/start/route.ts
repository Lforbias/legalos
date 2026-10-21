import { NextResponse, type NextRequest } from "next/server";
import { startDriveConnect } from "@/server/services/google-drive.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

/** Inicia o consentimento OAuth do Google (só administrador de integrações com 2FA). Redireciona para o Google. */
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.redirect(new URL("/login", req.url));
  try {
    const { url } = await startDriveConnect(tenant.ctx);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível iniciar a conexão.";
    return NextResponse.redirect(new URL(`/integracoes?google=erro&msg=${encodeURIComponent(msg.slice(0, 160))}`, req.url));
  }
}
