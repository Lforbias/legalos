"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type { ActionState } from "@/lib/validation/common";
import { deleteDriveAction, disconnectDriveAction, pullFromDriveAction, saveDriveCredentialsAction, sendToDriveAction, setDriveEnabledAction, unlinkDriveAction } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>, okMsg?: string) =>
    start(async () => {
      setDone(null);
      const r = await fn();
      if (!r.ok) setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível concluir.");
      else {
        setError(null);
        if (okMsg) setDone(okMsg);
        router.refresh();
      }
    });
  return { run, pending, error, done };
}

export function DriveSettingsPanel({ s }: { s: { vault: boolean; redirectUri: string; hasCredentials: boolean; clientId: string; connected: boolean; enabled: boolean; folderName: string; lastError: string | null } }) {
  const { run, pending, error, done } = useRun();
  const [clientId, setClientId] = React.useState(s.clientId);
  const [clientSecret, setClientSecret] = React.useState("");
  const [folderName, setFolderName] = React.useState(s.folderName);
  if (!s.vault) return <Alert tone="warning">O cofre ainda não foi habilitado neste sistema (falta CERT_ENCRYPTION_KEY). Sem ele não dá para guardar as credenciais do Google.</Alert>;
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      {s.lastError ? <Alert tone="warning">Último erro do Google: {s.lastError}</Alert> : null}
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Como obter o Client ID e o Client Secret</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>No Google Cloud Console, crie (ou escolha) um projeto do escritório e ative a API do Google Drive.</li>
          <li>Em “Tela de consentimento OAuth”, configure o app (uso interno ou externo em teste) e adicione o escopo <code>.../auth/drive.file</code>.</li>
          <li>Em “Credenciais”, crie um “ID do cliente OAuth” do tipo Aplicativo da Web e cadastre como URI de redirecionamento autorizado: <code className="break-all">{s.redirectUri}</code></li>
          <li>Cole abaixo o Client ID e o Client Secret e clique em Conectar.</li>
        </ol>
      </details>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Client ID" htmlFor="g-id">
          <Input id="g-id" autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </Field>
        <Field label="Client Secret" htmlFor="g-secret" hint={s.hasCredentials ? "Guardado e cifrado. Preencha só para trocar." : undefined}>
          <Input id="g-secret" type="password" autoComplete="new-password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
        </Field>
        <Field label="Pasta no Drive" htmlFor="g-folder" hint="Criada pelo LegalOS; ele só enxerga o que ele mesmo criar.">
          <Input id="g-folder" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button loading={pending} disabled={!clientId || !clientSecret} onClick={() => run(() => saveDriveCredentialsAction({ clientId, clientSecret, folderName }), "Credenciais guardadas (cifradas).")}>
          Guardar credenciais
        </Button>
        {s.hasCredentials ? <a href="/api/integrations/google/start" className={buttonVariants({ variant: "secondary" })}>{s.connected ? "Reconectar ao Google" : "Conectar ao Google"}</a> : null}
        {s.connected ? (
          <Button variant={s.enabled ? "secondary" : "primary"} loading={pending} onClick={() => run(() => setDriveEnabledAction(!s.enabled))}>
            {s.enabled ? "Desligar" : "Ligar"} o Drive neste escritório
          </Button>
        ) : null}
        {s.connected ? (
          <Button variant="ghost" loading={pending} onClick={() => run(() => disconnectDriveAction(), "Desconectado e acesso revogado no Google.")}>Desconectar</Button>
        ) : null}
        {s.hasCredentials ? (
          <Button
            variant="danger"
            loading={pending}
            onClick={() => {
              if (!window.confirm("Apagar as credenciais do Google deste escritório? Os arquivos já enviados continuam no seu Drive.")) return;
              run(() => deleteDriveAction(), "Credenciais apagadas.");
            }}
          >
            Apagar credenciais
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentDriveCard({ documentId, link, convertible }: { documentId: string; link: { webViewLink: string; isGoogleDoc: boolean; sentVersion: number } | null; convertible: boolean }) {
  const { run, pending, error, done } = useRun();
  return (
    <div className="space-y-2 text-sm">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      {link ? (
        <p>
          Enviado (v{link.sentVersion}) — <a className="text-primary-text hover:underline" href={link.webViewLink} target="_blank" rel="noreferrer noopener">abrir no Google {link.isGoogleDoc ? "Docs" : "Drive"}</a>
        </p>
      ) : (
        <p className="text-muted">Ainda não enviado ao Drive.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {convertible ? (
          <Button size="sm" loading={pending} onClick={() => run(() => sendToDriveAction(documentId, true), "Enviado como Documento Google.")}>Enviar para editar no Google Docs</Button>
        ) : null}
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => sendToDriveAction(documentId, false), "Enviado ao Drive.")}>Enviar cópia ao Drive</Button>
        {link ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => pullFromDriveAction(documentId), "Nova versão criada a partir do Drive.")}>Trazer edição de volta</Button> : null}
        {link ? <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => unlinkDriveAction(documentId))}>Esquecer ligação</Button> : null}
      </div>
      <p className="text-xs text-muted">Trazer de volta cria uma nova versão; a anterior fica guardada. Petições em revisão voltam a rascunho.</p>
    </div>
  );
}
