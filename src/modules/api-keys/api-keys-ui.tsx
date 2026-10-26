"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";

export type ApiKeyView = { id: string; name: string; prefix: string; scopes: string[]; status: "ACTIVE" | "EXPIRED" | "REVOKED"; expiresAt: string | null; lastUsedAt: string | null; createdAt: string };
export type ScopeOption = { key: string; label: string; allowed: boolean };

const STATUS = { ACTIVE: ["success", "Ativa"], EXPIRED: ["warning", "Expirada"], REVOKED: ["warning", "Revogada"] } as const;

export function ApiKeyList({ items, scopeLabels }: { items: ApiKeyView[]; scopeLabels: Record<string, string> }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  if (!items.length) return <p className="text-sm text-muted">Nenhuma chave criada.</p>;
  return (
    <div className="space-y-3">
      {msg ? <Alert tone="error">{msg}</Alert> : null}
      {items.map((k) => {
        const [tone, label] = STATUS[k.status];
        return (
          <div key={k.id} className="rounded-md border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{k.name}</div>
                <div className="text-xs text-muted">lgos_{k.prefix}_… · {k.scopes.map((s) => scopeLabels[s] ?? s).join(", ")}</div>
              </div>
              <Badge tone={tone}>{label}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted">
              Criada em {new Date(k.createdAt).toLocaleDateString("pt-BR")} · {k.expiresAt ? `vale até ${new Date(k.expiresAt).toLocaleDateString("pt-BR")}` : "sem validade"} · {k.lastUsedAt ? `último uso ${new Date(k.lastUsedAt).toLocaleString("pt-BR")}` : "nunca usada"}
            </p>
            {k.status !== "REVOKED" ? (
              <div className="mt-2">
                <Button
                  variant="danger"
                  loading={pending}
                  onClick={() => {
                    if (!window.confirm("Revogar esta chave? Os sistemas que a usam deixarão de funcionar imediatamente.")) return;
                    start(async () => {
                      const r = await revokeApiKeyAction(k.id);
                      setMsg(r.ok ? null : (r.message ?? "Não foi possível revogar (exige 2FA ativo)."));
                      router.refresh();
                    });
                  }}
                >
                  Revogar
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ApiKeyForm({ scopes }: { scopes: ScopeOption[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [days, setDays] = React.useState("365");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <div className="space-y-3">
      {token ? (
        <Alert tone="success">
          <p className="font-medium">Chave criada. Copie agora: ela não será mostrada de novo.</p>
          <code data-testid="new-api-key" className="mt-2 block break-all rounded bg-white p-2 text-xs text-slate-900">{token}</code>
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Nome (quem vai usar)" htmlFor="apikey-name">
        <Input id="apikey-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Acessos</legend>
        {scopes.map((s) => (
          <label key={s.key} className={`flex items-center gap-2 text-sm ${s.allowed ? "" : "text-muted"}`}>
            <input type="checkbox" disabled={!s.allowed} checked={picked.includes(s.key)} onChange={() => toggle(s.key)} />
            {s.label}
            {s.allowed ? null : " (seu perfil não permite)"}
          </label>
        ))}
      </fieldset>
      <Field label="Validade" htmlFor="apikey-days">
        <Select id="apikey-days" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="30">30 dias</option>
          <option value="90">90 dias</option>
          <option value="365">1 ano</option>
          <option value="730">2 anos</option>
          <option value="">Sem validade</option>
        </Select>
      </Field>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setToken(null);
            const r = await createApiKeyAction({ name, scopes: picked, expiresInDays: days ? Number(days) : null });
            if (!r.ok || !r.data) return setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível criar a chave.");
            setError(null);
            setToken(r.data.token);
            setName("");
            setPicked([]);
            router.refresh();
          })
        }
      >
        Criar chave de API
      </Button>
    </div>
  );
}
