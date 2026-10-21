"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { PETITION_TYPE_KEYS, PETITION_TYPE_LABEL } from "@/lib/petitioning/types";
import { consultCaseMniAction, importAutosMniAction, createConnectionAction, deleteConnectionAction, setConnectionEnabledAction, setPetitionTypesAction, syncAvisosAction } from "./actions";

export type ConnectionView = { id: string; label: string; jtr: string; tribunal: string; endpointUrl: string; authMode: string; certificateLabel: string | null; enabled: boolean; lastSyncAt: string | null; lastStatus: string | null; lastMessage: string | null; petitionTypes: Record<string, string> };

function PetitionTypesEditor({ id, initial }: { id: string; initial: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = React.useState<Record<string, string>>(initial);
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <details className="mt-2 rounded-md border border-slate-200 p-2" data-testid={`types-${id}`}>
      <summary className="cursor-pointer text-xs font-medium">Protocolo de petições: códigos de tipo de documento do tribunal</summary>
      <p className="mt-2 text-xs text-slate-600">Cada tribunal tem os seus códigos (tabela do PJe). Preencha só o que o tribunal informou; sem o código da petição, o protocolo é recusado.</p>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {PETITION_TYPE_KEYS.map((k) => (
          <label key={k} className="block text-xs">
            {PETITION_TYPE_LABEL[k]}
            <Input aria-label={PETITION_TYPE_LABEL[k]} value={v[k] ?? ""} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
          </label>
        ))}
      </div>
      <Button className="mt-2" variant="secondary" loading={pending} onClick={() => start(async () => {
        const r = await setPetitionTypesAction(id, v);
        setMsg(r.ok ? { tone: "success", text: "Códigos salvos." } : { tone: "error", text: Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível salvar (exige 2FA ativo)." });
        router.refresh();
      })}>Salvar códigos</Button>
    </details>
  );
}

const MODE_LABEL: Record<string, string> = { PASSWORD: "Senha", CERTIFICATE: "Certificado digital", PASSWORD_AND_CERTIFICATE: "Senha + certificado" };

export function ConnectionList({ items }: { items: ConnectionView[] }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<void>) => start(fn);
  if (!items.length) return <p className="text-sm text-slate-600">Nenhuma conexão cadastrada.</p>;
  return (
    <div className="space-y-3">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {items.map((c) => (
        <div key={c.id} className="rounded-md border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{c.label}</div>
              <div className="text-xs text-slate-600">
                {c.tribunal} · {MODE_LABEL[c.authMode] ?? c.authMode}
                {c.certificateLabel ? ` · ${c.certificateLabel}` : ""}
              </div>
              <div className="break-all text-xs text-slate-500">{c.endpointUrl}</div>
            </div>
            {c.enabled ? <Badge tone="success">Ativa</Badge> : <Badge tone="warning">Desligada</Badge>}
          </div>
          {c.lastSyncAt ? (
            <p className="mt-2 text-xs text-slate-600">
              Última sincronização: {new Date(c.lastSyncAt).toLocaleString("pt-BR")} — {c.lastStatus === "OK" ? "ok" : "falhou"}
              {c.lastMessage ? `: ${c.lastMessage}` : ""}
            </p>
          ) : null}
          <PetitionTypesEditor id={c.id} initial={c.petitionTypes} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!c.enabled}
              loading={pending}
              onClick={() =>
                run(async () => {
                  const r = await syncAvisosAction(c.id);
                  if (!r.ok || !r.data) setMsg({ tone: "error", text: r.message ?? "Não foi possível sincronizar." });
                  else setMsg({ tone: "success", text: `${r.data.found} aviso(s) pendente(s) no tribunal: ${r.data.imported} importado(s) para a caixa de entrada, ${r.data.alreadyKnown} já conhecido(s). O teor não foi aberto.` });
                  router.refresh();
                })
              }
            >
              Sincronizar intimações
            </Button>
            <Button
              variant="secondary"
              loading={pending}
              onClick={() =>
                run(async () => {
                  const r = await setConnectionEnabledAction(c.id, !c.enabled);
                  setMsg(r.ok ? null : { tone: "error", text: r.message ?? "Não foi possível alterar." });
                  router.refresh();
                })
              }
            >
              {c.enabled ? "Desligar" : "Ligar"}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                if (!window.confirm("Remover esta conexão e a senha guardada? Não pode ser desfeito.")) return;
                run(async () => {
                  const r = await deleteConnectionAction(c.id);
                  setMsg(r.ok ? null : { tone: "error", text: r.message ?? "Não foi possível remover (exige 2FA ativo)." });
                  router.refresh();
                });
              }}
            >
              Remover
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConnectionForm({ tribunals, certificates }: { tribunals: { jtr: string; label: string }[]; certificates: { id: string; label: string }[] }) {
  const router = useRouter();
  const [f, setF] = React.useState({ label: "", jtr: tribunals[0]?.jtr ?? "", endpointUrl: "", authMode: "PASSWORD", certificateId: "", document: "", password: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [pending, start] = React.useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const needsCert = f.authMode !== "PASSWORD";
  const needsPassword = f.authMode !== "CERTIFICATE";
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="success">Conexão cadastrada. Use “Sincronizar intimações” para testar.</Alert> : null}
      <Field label="Nome da conexão" htmlFor="mni-label">
        <Input id="mni-label" value={f.label} onChange={set("label")} />
      </Field>
      <Field label="Tribunal" htmlFor="mni-jtr">
        <Select id="mni-jtr" value={f.jtr} onChange={set("jtr")}>
          {tribunals.map((t) => (
            <option key={t.jtr} value={t.jtr}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Endereço do serviço MNI (https)" htmlFor="mni-url" hint="Informado pelo tribunal; termina geralmente em /intercomunicacao.">
        <Input id="mni-url" value={f.endpointUrl} onChange={set("endpointUrl")} />
      </Field>
      <Field label="Forma de autenticação" htmlFor="mni-mode">
        <Select id="mni-mode" value={f.authMode} onChange={set("authMode")}>
          <option value="PASSWORD">Senha</option>
          <option value="CERTIFICATE">Certificado digital (mTLS)</option>
          <option value="PASSWORD_AND_CERTIFICATE">Senha + certificado</option>
        </Select>
      </Field>
      {needsCert ? (
        <Field label="Certificado do cofre" htmlFor="mni-cert">
          <Select id="mni-cert" value={f.certificateId} onChange={set("certificateId")}>
            <option value="">Selecione…</option>
            {certificates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="CPF/CNPJ do advogado (login do PJe)" htmlFor="mni-doc">
        <Input id="mni-doc" value={f.document} onChange={set("document")} autoComplete="off" />
      </Field>
      {needsPassword ? (
        <Field label="Senha do PJe" htmlFor="mni-pass" hint="Guardada cifrada; nunca é exibida de novo.">
          <Input id="mni-pass" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
      ) : null}
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setOk(false);
            const r = await createConnectionAction({ ...f, authMode: f.authMode as "PASSWORD" | "CERTIFICATE" | "PASSWORD_AND_CERTIFICATE" });
            if (!r.ok) return setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível cadastrar.");
            setError(null);
            setOk(true);
            setF((p) => ({ ...p, password: "", label: "", endpointUrl: "", document: "" }));
            router.refresh();
          })
        }
      >
        Cadastrar conexão
      </Button>
    </div>
  );
}

export function MniConsultButton({ caseId, label }: { caseId: string; label: string }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await consultCaseMniAction(caseId);
            if (!r.ok || !r.data) return setMsg({ tone: "error", text: r.message ?? "Não foi possível consultar o tribunal." });
            setMsg({ tone: "success", text: `Tribunal consultado (${label}): ${r.data.imported} novo(s) movimento(s) de ${r.data.total}.` });
            router.refresh();
          })
        }
      >
        Consultar no tribunal (MNI)
      </Button>
    </div>
  );
}

export function MniAutosButton({ caseId, label }: { caseId: string; label: string }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await importAutosMniAction(caseId);
            if (!r.ok || !r.data) return setMsg({ tone: "error", text: r.message ?? "Não foi possível baixar os autos." });
            const d = r.data;
            const skipped = d.skippedSecret + d.skippedUnsupported + d.skippedTooBig;
            setMsg({
              tone: "success",
              text: `Autos (${label}): ${d.imported} documento(s) novo(s) de ${d.listed} no tribunal.${d.alreadyKnown ? ` ${d.alreadyKnown} já estavam aqui.` : ""}${skipped ? ` ${skipped} não importado(s) (sigilosos, tipo não suportado ou grandes demais).` : ""}${d.remaining ? ` Faltam ${d.remaining}: clique de novo para continuar.` : ""}`,
            });
            router.refresh();
          })
        }
      >
        Baixar autos (MNI)
      </Button>
    </div>
  );
}
