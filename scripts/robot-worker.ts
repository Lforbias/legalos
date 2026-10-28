import "./load-env";
import { chromium, type Browser } from "playwright-core";
import { drainQueue, type RobotDeps } from "../src/server/robots/pje-runner";

/**
 * Worker do robô: fica de pé em um contêiner próprio (com Chromium), olha a fila a cada ROBOT_POLL_MS e roda um trabalho
 * por vez. O navegador só fica aberto enquanto há trabalho (economiza memória no servidor).
 *   npx tsx scripts/robot-worker.ts          → loop contínuo
 *   npx tsx scripts/robot-worker.ts --once   → esvazia a fila e sai
 */
const POLL_MS = Math.max(3_000, Number(process.env.ROBOT_POLL_MS ?? 10_000));
const once = process.argv.includes("--once");
let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { stopping = true; });

let browser: Browser | null = null;
const deps: RobotDeps = {
  openPage: async () => {
    browser ??= await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: { width: 1280, height: 900 } });
    // só o necessário para entrar: sem imagens, fontes ou mídia (menos memória e menos tráfego)
    await context.route("**/*", (route) => (["image", "font", "media"].includes(route.request().resourceType()) ? route.abort() : route.continue()));
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return { page, close: () => context.close() };
  },
};

const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  log("robot.worker.start", { pollMs: POLL_MS, once });
  while (!stopping) {
    try {
      const n = await drainQueue(deps);
      if (n) log("robot.worker.drained", { jobs: n });
    } catch (e) {
      log("robot.worker.error", { error: e instanceof Error ? e.message.slice(0, 200) : "erro" });
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
        browser = null;
      }
    }
    if (once) break;
    await sleep(POLL_MS);
  }
  log("robot.worker.stop");
  process.exit(0);
}
void main();
