import { expect, it, vi } from "vitest";
import { getWritableDriveFolder, GOOGLE_FOLDER_MIME, parseDriveFolder, uploadFile } from "@/lib/google/drive";

it("aceita somente IDs e links de pasta do Drive", () => {
  expect(parseDriveFolder(" pasta_123 ")).toEqual({ id: "pasta_123", resourceKey: null });
  expect(parseDriveFolder("https://drive.google.com/drive/u/0/folders/pasta_123?resourcekey=chave")).toEqual({ id: "pasta_123", resourceKey: "chave" });
  expect(parseDriveFolder("https://drive.google.com.example/drive/folders/pasta_123")).toBeNull();
  expect(parseDriveFolder("https://drive.google.com/file/d/arquivo/view")).toBeNull();
});

it("confere a permissão de adicionar arquivos e usa a chave da pasta no envio", async () => {
  const remote = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ name: "Cliente", mimeType: GOOGLE_FOLDER_MIME, capabilities: { canAddChildren: true } }))
    .mockResolvedValueOnce(Response.json({ id: "novo" }))
    .mockResolvedValueOnce(Response.json({ name: "Leitura", mimeType: GOOGLE_FOLDER_MIME, capabilities: { canAddChildren: false } }));
  const folder = { id: "pasta_123", resourceKey: "chave" };
  await expect(getWritableDriveFolder("token", folder, remote)).resolves.toBe("Cliente");
  await uploadFile("token", { name: "arquivo.txt", mimeType: "text/plain", parentId: folder.id, parentResourceKey: folder.resourceKey, buffer: Buffer.from("dados"), convertToDoc: false }, remote);
  expect(remote.mock.calls[1]?.[1]?.headers).toMatchObject({ "X-Goog-Drive-Resource-Keys": "pasta_123/chave" });
  expect(String(remote.mock.calls[1]?.[1]?.body)).toContain('"parents":["pasta_123"]');
  await expect(getWritableDriveFolder("token", folder, remote)).rejects.toThrow("adicionar arquivos");
});
