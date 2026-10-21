import { NextResponse, type NextRequest } from "next/server";
import { finishDriveConnect } from "@/server/services/google-drive.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

/** Retorno do Google: troca o código pelo token permanente (cifrado) e volta para Integrações. */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/integracoes?${q}`, req.url));
  const tenant = await getTenant();
  if (!tenant) return NextResponse.redirect(new URL("/login", req.url));
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back("google=erro&msg=" + encodeURIComponent("O consentimento foi recusado no Google."));
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return back("google=erro&msg=" + encodeURIComponent("Resposta do Google incompleta."));
  try {
    await finishDriveConnect(tenant.ctx, { state, code });
    return back("google=ok");
  } catch (e) {
    return back(`google=erro&msg=${encodeURIComponent((e instanceof Error ? e.message : "Falha ao conectar.").slice(0, 160))}`);
  }
}
