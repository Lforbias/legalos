import fs from "node:fs";
import path from "node:path";

// Carrega .env sem depender de bibliotecas (apenas para scripts CLI; o Next.js carrega o seu próprio).
const file = path.resolve(process.cwd(), ".env");
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const [, key, raw] = m;
    if (key && process.env[key] === undefined) process.env[key] = (raw ?? "").replace(/^["']|["']$/g, "");
  }
}
