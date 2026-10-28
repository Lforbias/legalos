import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
async function main() {
const root = path.join(process.cwd(), "extensions/legalos-pje");
const zip = new JSZip();
for (const name of (await fs.readdir(root)).sort()) if (!name.endsWith(".d.mts")) zip.file(name, await fs.readFile(path.join(root, name)), { date: new Date("2026-10-28T00:00:00Z") });
await fs.mkdir("public/downloads", { recursive: true });
await fs.writeFile("public/downloads/legalos-pje.zip", await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
