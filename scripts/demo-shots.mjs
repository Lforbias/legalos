// Gera as capturas da página /produto a partir do escritório de DEMONSTRAÇÃO (dados fictícios). Uso: node scripts/demo-shots.mjs http://localhost:3100
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:3100";
const out = "public/produto";
const SHOTS = [
  ["painel", "/"],
  ["atendimento", "/atendimento", async (pg) => { await pg.getByText("Marcos Vinícius Paiva").first().click(); await pg.waitForTimeout(1200); }],
  ["caixa", "/caixa-de-entrada"],
  ["processos", "/processos"],
  ["processo", "/processos", async (pg) => { await pg.getByRole("link", { name: /Reclamação trabalhista/ }).first().click(); await pg.waitForLoadState("networkidle"); }],
  ["prazos", "/prazos"],
  ["financeiro", "/financeiro"],
  ["agenda", "/agenda"],
  ["tarefas", "/tarefas"],
  ["relatorios", "/relatorios"],
  // 5.0 e 6.0
  ["calculo", "/calculos/2036dea0-9d8e-4a01-bee2-58d8a7653678"],
  ["copiloto", "/copiloto", async (pg) => { await pg.locator("a[href^='/copiloto/']").first().click(); await pg.waitForLoadState("networkidle"); }],
  ["metas", "/equipe/metas"],
  ["rute-propostas", "/rute?aba=propostas"],
  ["rute-conexoes", "/rute?aba=conexoes"],
  ["rute-assistente", "/rute?aba=assistente", async (pg) => { await pg.getByRole("link", { name: /O que preciso fazer hoje/ }).first().click(); await pg.waitForLoadState("networkidle"); }],
  ["rute-biblioteca", "/rute?aba=biblioteca"],
  ["rute-governanca", "/rute?aba=governanca"],
];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem("lo-theme", "dark"));
await page.goto(`${base}/login`);
await page.getByLabel("E-mail").fill("demo@escritoriomodelo.test");
await page.getByLabel("Senha").fill("DemoSenha2026!");
await page.getByRole("button", { name: /Entrar/ }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
const only = process.argv[3] ? process.argv[3].split(",") : null;
for (const [name, path, act] of SHOTS) {
  if (only && !only.includes(name)) continue;
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  if (act) await act(page);
  await page.waitForTimeout(700);
  const buf = await page.screenshot({ type: "png" });
  await sharp(buf).resize({ width: 1800 }).webp({ quality: 82 }).toFile(`${out}/${name}.webp`);
  console.log("ok", name, page.url());
}
await browser.close();
