import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { NextResponse, type NextRequest } from "next/server";
import { assertCan } from "@/server/context";
import { errorResponse, isSameOrigin } from "@/server/http";
import { getTenant } from "@/server/session";
import { runAstreaImport, type ImportReport } from "@/server/import/astrea-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Manifest = { ownerId: string; organizationId: string; dir: string; createdAt: number; report: ImportReport };
const root = path.join(os.tmpdir(), "legalos-astrea-import");
const MAX_ZIP = 160 * 1024 * 1024;
const MAX_EXPANDED = 300 * 1024 * 1024;
const MAX_FILES = 50;

async function manifestPath(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Envio inválido. Selecione o ZIP novamente.");
  return path.join(root, `${id}.json`);
}

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Entre novamente para importar." }, { status: 401 });
    const { ctx } = tenant;
    assertCan(ctx, "organization:manage");
    const form = await req.formData();
    const action = String(form.get("action") ?? "");

    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    for (const filename of await fs.readdir(root)) {
      if (!filename.endsWith(".json")) continue;
      const file = path.join(root, filename);
      try {
        const old = JSON.parse(await fs.readFile(file, "utf8")) as Manifest;
        if (Date.now() - old.createdAt > 2 * 60 * 60 * 1000) {
          await fs.rm(old.dir, { recursive: true, force: true });
          await fs.rm(file, { force: true });
        }
      } catch { await fs.rm(file, { force: true }); }
    }

    if (action === "preview") {
      const zipFile = form.get("file");
      if (!(zipFile instanceof File) || !zipFile.name.toLowerCase().endsWith(".zip")) return NextResponse.json({ error: "Selecione um arquivo ZIP do backup Astrea." }, { status: 422 });
      if (zipFile.size <= 0 || zipFile.size > MAX_ZIP) return NextResponse.json({ error: "O ZIP deve ter até 160 MB." }, { status: 413 });
      const zip = await JSZip.loadAsync(await zipFile.arrayBuffer(), { checkCRC32: true });
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".csv") && !entry.name.startsWith("__MACOSX/"));
      if (!entries.length || entries.length > MAX_FILES) return NextResponse.json({ error: "O ZIP precisa conter até 50 arquivos CSV do backup." }, { status: 422 });
      const id = randomUUID();
      const dir = path.join(root, id);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      let expanded = 0;
      const seen = new Set<string>();
      for (const entry of entries) {
        const parts = entry.name.split("/");
        const filename = parts.at(-1) ?? "";
        if (parts.length > 2 || parts.some((part) => part === "..") || !filename || path.basename(filename) !== filename || seen.has(filename.normalize("NFC"))) {
          await fs.rm(dir, { recursive: true, force: true });
          return NextResponse.json({ error: "O ZIP contém caminhos ou nomes de arquivo inválidos." }, { status: 422 });
        }
        seen.add(filename.normalize("NFC"));
        const content = await entry.async("nodebuffer");
        expanded += content.byteLength;
        if (expanded > MAX_EXPANDED) {
          await fs.rm(dir, { recursive: true, force: true });
          return NextResponse.json({ error: "O conteúdo descompactado ultrapassa 300 MB." }, { status: 413 });
        }
        await fs.writeFile(path.join(dir, filename), content, { mode: 0o600, flag: "wx" });
      }
      const report = await runAstreaImport({ organizationId: ctx.organizationId, importerUserId: ctx.userId, dir, dryRun: true, timezone: ctx.timezone });
      const manifest: Manifest = { ownerId: ctx.userId, organizationId: ctx.organizationId, dir, createdAt: Date.now(), report };
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      await fs.writeFile(await manifestPath(id), JSON.stringify(manifest), { mode: 0o600 });
      const expiry = setTimeout(() => {
        void fs.rm(dir, { recursive: true, force: true });
        void fs.rm(path.join(root, `${id}.json`), { force: true });
      }, 2 * 60 * 60 * 1000);
      expiry.unref();
      return NextResponse.json({ id, report });
    }

    if (action === "discard") {
      const id = String(form.get("id") ?? "");
      const file = await manifestPath(id);
      const manifest = JSON.parse(await fs.readFile(file, "utf8")) as Manifest;
      if (manifest.ownerId !== ctx.userId || manifest.organizationId !== ctx.organizationId) return NextResponse.json({ error: "Simulação não encontrada." }, { status: 404 });
      await fs.rm(manifest.dir, { recursive: true, force: true });
      await fs.rm(file, { force: true });
      return NextResponse.json({ ok: true });
    }

    if (action === "import") {
      const id = String(form.get("id") ?? "");
      const manifest = JSON.parse(await fs.readFile(await manifestPath(id), "utf8")) as Manifest;
      if (!manifest.report.dryRun || manifest.ownerId !== ctx.userId || manifest.organizationId !== ctx.organizationId || Date.now() - manifest.createdAt > 2 * 60 * 60 * 1000) {
        await fs.rm(manifest.dir, { recursive: true, force: true });
        return NextResponse.json({ error: "A simulação expirou. Envie o ZIP novamente." }, { status: 410 });
      }
      const report = await runAstreaImport({ organizationId: ctx.organizationId, importerUserId: ctx.userId, dir: manifest.dir, timezone: ctx.timezone });
      await fs.rm(manifest.dir, { recursive: true, force: true });
      await fs.rm(await manifestPath(id), { force: true });
      return NextResponse.json({ report });
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 422 });
  } catch (err) {
    return errorResponse(err);
  }
}
