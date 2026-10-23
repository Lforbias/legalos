"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { saveDatajudKeyAction, testDatajudAction, setDatajudEnabledAction } from "@/modules/cases/datajud-actions";

export function DatajudToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button
        variant={enabled ? "secondary" : "primary"}
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await setDatajudEnabledAction(!enabled);
            if (!r.ok) setError(r.message ?? "Não foi possível alterar.");
            else {
              setError(null);
              router.refresh();
            }
          })
        }
      >
        {enabled ? "Desligar DataJud neste escritório" : "Ligar DataJud neste escritório"}
      </Button>
    </div>
  );
}

export function DatajudKeyForm({ ownKey, vaultAvailable, configured }: { ownKey: boolean; vaultAvailable: boolean; configured: boolean }) {
  const router = useRouter();
  const [key, setKey] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [ok, setOk] = React.useState(false);
  const [pending, start] = React.useTransition();
  return <div className="space-y-2">
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); start(async () => {
      const r = await saveDatajudKeyAction(key);
      setOk(r.ok); setMessage(r.ok ? "Chave guardada. Teste a conexão e ligue o DataJud neste escritório." : r.message ?? "Falha ao guardar.");
      if (r.ok) { setKey(""); router.refresh(); }
    }); }}>
      <label className="min-w-60 flex-1 text-sm">Chave pública do DataJud<Input type="password" value={key} onChange={e => setKey(e.target.value)} autoComplete="off" maxLength={600} disabled={!vaultAvailable || pending} placeholder={ownKey ? "Guardada; preencha apenas para trocar" : "Cole a APIKey do CNJ"} /></label>
      <Button type="submit" loading={pending} disabled={!vaultAvailable || !key.trim()}>Guardar chave DataJud</Button>
      <Button type="button" variant="secondary" disabled={!configured} loading={pending} onClick={() => start(async () => {
        const r = await testDatajudAction(); setOk(r.ok); setMessage(r.ok ? "Conexão DataJud validada: autenticação aceita pelo CNJ." : r.message ?? "Falha no teste.");
      })}>Testar DataJud</Button>
    </form>
    <p className="text-xs text-muted">{ownKey ? "Chave do escritório guardada com cifra; nunca é exibida de novo." : "A chave cadastrada aqui vale para este escritório; sem ela, usa a configuração do servidor."} {!vaultAvailable ? "A cifra precisa ser configurada no servidor para guardar uma chave." : ""}</p>
    {message ? <Alert tone={ok ? "success" : "error"}>{message}</Alert> : null}
  </div>;
}
