"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useRun } from "@/modules/kanban/use-run";
import { decideAuthorizationAction } from "./oauth-actions";

type Scope = { key: string; label: string };

export function OAuthConsent(p: { clientId: string; redirectUri: string; codeChallenge: string; state?: string; scopes: Scope[] }) {
  const { run, pending, error } = useRun();
  const [picked, setPicked] = useState<string[]>(p.scopes.map((s) => s.key));
  const [done, setDone] = useState(false);

  const go = (allow: boolean) =>
    run(
      () => decideAuthorizationAction({ clientId: p.clientId, redirectUri: p.redirectUri, codeChallenge: p.codeChallenge, state: p.state, scopes: picked.length ? picked : p.scopes.map((s) => s.key), allow }),
      undefined,
      (d) => {
        if (d) {
          setDone(true);
          window.location.assign(d.redirect);
        }
      },
    );

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
