"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { createClientDriveFolderAction, setClientDriveFolderAction } from "./actions";

export function ClientDriveFolder({ clientId, folder, canManage }: {
  clientId: string;
  folder: { name: string; href: string } | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (input: string | null) => start(async () => {
    setError(null);
    try {
      const result = await setClientDriveFolderAction(clientId, input);
      if (!result.ok) {
        setError(result.message ?? "Não foi possível atualizar o vínculo.");
        return;
      }
      setValue("");
      setEditing(false);
      router.refresh();
    } catch {
      setError("Não foi possível atualizar o vínculo. Tente novamente.");
    }
  });

  const create = () => start(async () => {
    setError(null);
    try {
      const result = await createClientDriveFolderAction(clientId);
      if (!result.ok) {
        setError(result.message ?? "Não foi possível criar a pasta.");
        return;
      }
      router.refresh();
    } catch {
      setError("Não foi possível criar a pasta. Tente novamente.");
    }
  });

  if (!folder && !canManage) return null;
  return (
    <Card>
      <CardHeader title="Pasta no Google Drive" />
      <CardBody className="space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {folder ? <a className="block break-words text-sm text-primary-text underline" href={folder.href} target="_blank" rel="noopener noreferrer">{folder.name}</a> : null}
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {!folder && !editing ? <Button size="sm" loading={pending} onClick={create}>Criar pasta no Drive</Button> : null}
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(!editing)}>{editing ? "Cancelar" : folder ? "Trocar pasta" : "Vincular pasta existente"}</Button>
            {folder && !editing ? <Button size="sm" variant="secondary" loading={pending} onClick={() => save(null)}>Desvincular</Button> : null}
          </div>
        ) : null}
        {editing ? (
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); save(value); }}>
            <Field label="Link ou ID da pasta" htmlFor={`drive-folder-${clientId}`} hint="Use uma pasta à qual a integração já tenha acesso para adicionar arquivos. Novos envios deste cliente vão para essa pasta.">
              <Input id={`drive-folder-${clientId}`} value={value} onChange={(event) => setValue(event.target.value)} required maxLength={1000} />
            </Field>
            <Button type="submit" size="sm" loading={pending} disabled={!value.trim()}>Salvar vínculo</Button>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
