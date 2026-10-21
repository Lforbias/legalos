// Gera os ícones PWA a partir de src/app/icon.svg. Uso: node scripts/gen-pwa-icons.mjs
import sharp from "sharp";
import fs from "node:fs";

const svg = fs.readFileSync("src/app/icon.svg", "utf8");
const glyph = svg.match(/<path[^>]*\/>/)?.[0];
if (!glyph) throw new Error("glifo não encontrado em icon.svg");
const defs = svg.match(/<defs>.*<\/defs>/)?.[0] ?? "";

// "any": ícone com cantos arredondados (o próprio icon.svg).
const any = Buffer.from(svg);
// "maskable": fundo sangrado (sem cantos) e glifo reduzido a ~60% para ficar na zona segura de 80%.
const maskable = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${defs}<rect width="32" height="32" fill="url(#g)"/><g transform="translate(6.4 6.4) scale(0.6)">${glyph}</g></svg>`,
);

const out = [
  ["public/pwa/icon-192.png", any, 192],
  ["public/pwa/icon-512.png", any, 512],
  ["public/pwa/maskable-512.png", maskable, 512],
  ["public/pwa/apple-touch-icon.png", maskable, 180],
];
for (const [file, input, size] of out) {
  await sharp(input, { density: 600 }).resize(size, size).png().toFile(file);
  console.log("ok", file);
}
