import type { Page } from "playwright-core";
import { collectSignature } from "./login";
import { sanitizeSignature, type PageSignature } from "./signature";
import type { PjeTarget } from "./targets";

/**
 * Primeira versão da leitura do painel: SÓ olha (GET) a tela do painel do advogado e devolve a assinatura dela.
 * Não clica em expediente (abrir geraria ciência e abriria prazo) e não lê conteúdo de processos. A leitura real das
 * intimações é escrita depois de conferida contra a tela real.
 */
export async function probePjePanel(page: Page, target: PjeTarget, names: readonly string[] = []): Promise<{ landing: PageSignature | null; panel: PageSignature | null }> {
  const read = async () => {
    try {
      return sanitizeSignature(await page.evaluate(collectSignature), names);
    } catch {
      return null;
    }
  };
  const landing = await read();
  let panel: PageSignature | null = null;
  try {
    await page.goto(`${target.origin}/pje/Painel/painel_usuario/advogado.seam`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => undefined);
    panel = await read();
  } catch {
    panel = null;
  }
  return { landing, panel };
}
