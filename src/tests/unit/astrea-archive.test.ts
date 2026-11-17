import { readdir, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { expect, it } from "vitest";
import { withAstreaArchive } from "@/server/import/astrea-archive";

it("abre a pasta do backup e extrai somente as planilhas usadas pelo importador", async () => {
  const zip = new JSZip();
  zip.file("Backup/Contatos.csv", "Código,Nome\n1,Cliente");
  zip.file("Backup/Históricos.csv".normalize("NFD"), "Código\n1");
  zip.file("Backup/senha.txt", "ignorado");
  zip.file("fora.csv", "ignorado");
  const bytes = await zip.generateAsync({ type: "nodebuffer" });

  const extracted = await withAstreaArchive(bytes, async (dir) => {
    expect((await readdir(dir)).sort()).toEqual(["Contatos.csv", "Históricos.csv"]);
    expect(await readFile(`${dir}/Contatos.csv`, "utf8")).toContain("1,Cliente");
    return dir;
  });
  await expect(readdir(extracted)).rejects.toMatchObject({ code: "ENOENT" });
});

it("recusa arquivos corrompidos ou com mais de um backup", async () => {
  const zip = new JSZip();
  zip.file("primeiro/Contatos.csv", "Código\n1");
  zip.file("segundo/Processos.csv", "Código\n2");
  await expect(withAstreaArchive(await zip.generateAsync({ type: "nodebuffer" }), async () => {})).rejects.toThrow("um único backup");
  await expect(withAstreaArchive(Buffer.from("zip inválido"), async () => {})).rejects.toThrow("Não foi possível ler o ZIP");
});
