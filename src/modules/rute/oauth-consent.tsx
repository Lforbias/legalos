"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { decideAuthorizationAction } from "./oauth-actions";

type Scope = { key: string; label: string };

export function OAuthConsent(p: { clientId: string; redirectUri: string; codeChallenge: string; state?: string; scopes: Scope[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(p.scopes.map((s) => s.key));
  const [done, setDone] = useState(false);

  const go = (allow: boolean) => {
    startTransition(async () => {
      setError(null);
      try {
        const result = await decideAuthorizationAction({
          clientId: p.clientId,
          redirectUri: p.redirectUri,
          codeChallenge: p.codeChallenge,
          state: p.state,
          scopes: allow ? picked : p.scopes.map((scope) => scope.key),
          allow,
        });
        if (!result.ok) {
          setError(Object.values(result.fieldErrors ?? {})[0]?.[0] ?? result.message ?? "Não foi possível concluir a autorização.");
          return;
        }
        if (!result.data) {
          setError("O LegalOS não retornou o endereço para concluir a autorização.");
          return;
        }
        window.location.assign(result.data.redirect);
        setDone(true);
      } catch {
        setError("Não foi possível concluir a autorização. Tente conectar novamente pelo aplicativo.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {p.scopes.map((s) => (
          <label key={s.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={picked.includes(s.key)}
              onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((k) => k !== s.key)))}
            />
            <span>{s.label}</span>
          </label>
        ))}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">Pronto. Voltando para o aplicativo…</Alert> : null}
      <div className="flex gap-2">
        <Button loading={pending} disabled={picked.length === 0 || done} onClick={() => go(true)}>
          Permitir
        </Button>
        <Button variant="secondary" disabled={pending || done} onClick={() => go(false)}>
          Negar
        </Button>
      </div>
    </div>
  );
}
