"use client";
import { OFFICIAL_MNI_TARGETS } from "@/lib/connectors/official-targets";

import { mniEndpointProblem, TRF1_MNI_SOURCE, TRF1_MNI_TARGETS } from "@/lib/connectors/endpoint";
import { COURT_SYSTEMS } from "@/lib/court-systems";
import { connectionSupports, ENVIRONMENT_LABEL } from "@/lib/connectors/capabilities";
import { useRouter } from "next/navigation";
import { AutosQueue } from "@/modules/documents/autos-queue";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { PETITION_TYPE_KEYS, PETITION_TYPE_LABEL } from "@/lib/petitioning/types";
import { prepareOfficialTargetsAction, updateConnectionTargetAction, inspectContractAction, consultCaseMniAction, createConnectionAction, deleteConnectionAction, setConnectionEnabledAction, setPetitionTypesAction, syncAvisosAction } from "./actions";

export type ConnectionView = { wsdlUrl?: string | null; authProfile?: string; system?: string; environment?: string; wsdlStatus?: string | null; wsdlCheckedAt?: string | null; wsdlOperations?: string[]; id: string; label: string; jtr: string; tribunal: string; endpointUrl: string; authMode: string; certificateLabel: string | null; enabled: boolean; lastSyncAt: string | null; lastStatus: string | null; lastMessage: string | null; petitionTypes: Record<string, string> };

function PetitionTypesEditor({ id, initial }: { id: string; initial: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = React.useState<Record<string, string>>(initial);
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <details className="mt-2 rounded-md border border-slate-200 p-2" data-testid={`types-${id}`}>
      <summary className="cursor-pointer text-xs font-medium">Protocolo de petições: códigos de tipo de documento do tribunal</summary>
      <p className="mt-2 text-xs text-muted">Cada tribunal tem os seus códigos (tabela do PJe). Preencha só o que o tribunal informou; sem o código da petição, o protocolo é recusado.</p>
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

function ConnectionTargetEditor({ connection }: { connection: ConnectionView }) {
  const router = useRouter(); const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string>();
  const [target, setTarget] = React.useState({ endpointUrl: connection.endpointUrl, wsdlUrl: connection.wsdlUrl ?? "", environment: connection.environment ?? "UNSPECIFIED" });
  return <details className="mt-3 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Corrigir destino sem apagar o certificado</summary>
    <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); setError(undefined); start(async () => { const res = await updateConnectionTargetAction(connection.id, { ...target, jtr: connection.jtr }); if (!res.ok) setError(res.message); else router.refresh(); }); }}>
      {connection.jtr === "4.01" ? <><Field label="Endereço publicado pelo TRF1" htmlFor={`preset-${connection.id}`}><Select id={`preset-${connection.id}`} defaultValue="" onChange={event => { const selected = TRF1_MNI_TARGETS.find(t => t.key === event.target.value); if (selected) setTarget({ endpointUrl: selected.endpointUrl, wsdlUrl: `${selected.endpointUrl}?wsdl`, environment: selected.environment }); }}><option value="">Selecionar ambiente e grau</option>{TRF1_MNI_TARGETS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</Select></Field><p className="text-xs text-muted">O TRF1 exige autorização institucional e liberação do IP do servidor. Certificado sozinho não libera o MNI. <a href={TRF1_MNI_SOURCE} target="_blank" rel="noreferrer" className="underline">Orientação oficial</a>.</p></> : null}
      <Field label="Endereço do serviço MNI SOAP" htmlFor={`target-${connection.id}`} hint="Não use Swagger, página de login ou link temporário do SSO."><Input id={`target-${connection.id}`} type="url" value={target.endpointUrl} onChange={event => setTarget({ ...target, endpointUrl: event.target.value })} required /></Field>
      <Field label="Endereço do WSDL" htmlFor={`wsdl-${connection.id}`}><Input id={`wsdl-${connection.id}`} type="url" value={target.wsdlUrl} onChange={event => setTarget({ ...target, wsdlUrl: event.target.value })} /></Field>
      <Field label="Ambiente" htmlFor={`env-${connection.id}`}><Select id={`env-${connection.id}`} value={target.environment} onChange={event => setTarget({ ...target, environment: event.target.value })}>{Object.entries(ENVIRONMENT_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
      <p className="text-xs text-muted">Salvar mantém as credenciais, restringe o certificado desta conexão a consultas e deixa a conexão desligada para nova verificação. Não consulta nem altera processos no tribunal.</p>
      {error ? <Alert tone="error">{error}</Alert> : null}<Button type="submit" loading={pending}>Salvar destino e limitar a consultas</Button>
    </form></details>;
}

export function ConnectionList({ items }: { items: ConnectionView[] }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<void>) => start(fn);
  if (!items.length) return <p className="text-sm text-muted">Nenhuma conexão cadastrada.</p>;
  return (
    <div className="space-y-3">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {items.map((c) => (
        <div key={c.id} className="rounded-md border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{c.label}</div>
              <div className="text-xs text-muted">
                {COURT_SYSTEMS.find(s => s.key === c.system)?.label ?? "PJe (MNI)"} · {ENVIRONMENT_LABEL[(c.environment ?? "UNSPECIFIED") as keyof typeof ENVIRONMENT_LABEL]} · {c.tribunal} · {MODE_LABEL[c.authMode] ?? c.authMode}
                {c.certificateLabel ? ` · ${c.certificateLabel}` : ""}
              </div>
              <div className="break-all text-xs text-muted">{c.endpointUrl}</div>
            </div>
            {c.enabled ? <Badge tone={c.wsdlStatus === "COMPATIBLE" && !mniEndpointProblem(c.endpointUrl) ? "info" : "warning"}>{c.wsdlStatus === "COMPATIBLE" && !mniEndpointProblem(c.endpointUrl) ? "Habilitada (acesso não confirmado)" : "Habilitada · não verificada"}</Badge> : <Badge tone="warning">Desligada</Badge>}
          </div>
          {mniEndpointProblem(c.endpointUrl) ? <Alert tone="error" className="mt-2">{mniEndpointProblem(c.endpointUrl)}</Alert> : null}
          <ConnectionTargetEditor connection={c} />
          {c.lastSyncAt ? (
            <p className="mt-2 text-xs text-muted">
              Última sincronização: {new Date(c.lastSyncAt).toLocaleString("pt-BR")} — {c.lastStatus === "OK" ? "ok" : "falhou"}
              {c.lastMessage ? `: ${c.lastMessage}` : ""}
            </p>
          ) : null}
          <p className="mt-2 text-xs">Contrato: {c.wsdlStatus === "COMPATIBLE" ? "MNI 2.2.2 compatível (acesso e homologação pendentes)" : c.wsdlStatus === "INCOMPATIBLE" ? "Incompatível com o adaptador atual" : "Ainda não verificado"}{c.wsdlCheckedAt ? ` · ${new Date(c.wsdlCheckedAt).toLocaleString("pt-BR")}` : ""}</p>
          {c.wsdlOperations?.length ? <p className="text-xs">Operações declaradas: {c.wsdlOperations.join(", ")}</p> : null}
          <PetitionTypesEditor id={c.id} initial={c.petitionTypes} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" loading={pending} onClick={() => run(async () => {
              const r = await inspectContractAction(c.id);
              setMsg(r.ok && r.data ? { tone: r.data.compatible ? "success" : "info", text: r.data.message } : { tone: "error", text: r.message ?? "Não foi possível verificar o contrato." });
              router.refresh();
            })}>Verificar contrato WSDL</Button>
            <Button
              variant="secondary"
              disabled={!c.enabled || Boolean(mniEndpointProblem(c.endpointUrl)) || !connectionSupports({ system: c.system ?? "pje-mni", wsdlStatus: c.wsdlStatus ?? null, wsdlOperations: c.wsdlOperations ?? [], authProfile: c.authProfile }, "consultarAvisosPendentes")}
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
  const [f, setF] = React.useState({ wsdlUrl: "", authProfile: "STATIC", system: "pje-mni", environment: "HOMOLOGATION", label: "", jtr: tribunals[0]?.jtr ?? "", endpointUrl: "", authMode: "PASSWORD", certificateId: "", document: "", password: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [pending, start] = React.useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value, ...(["system", "jtr"].includes(k) ? { authProfile: "STATIC" } : {}) }));
  const needsCert = f.authMode !== "PASSWORD";
  const needsPassword = f.authMode !== "CERTIFICATE";
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="success">Conexão cadastrada. Verifique o contrato WSDL antes de ligar e testar as operações autorizadas.</Alert> : null}
      <Field label="Sistema da conexão" htmlFor="mni-system" hint="O adaptador atende MNI 2.2.2. Não atende MNI 3.0 ou APIs proprietárias.">
        <Select id="mni-system" value={f.system} onChange={set("system")}>{COURT_SYSTEMS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
      </Field>
      <Field label="Ambiente" htmlFor="mni-environment"><Select id="mni-environment" value={f.environment} onChange={set("environment")}><option value="HOMOLOGATION">Homologação</option><option value="PRODUCTION">Produção</option></Select></Field>
      <Field label="Perfil de autenticação" htmlFor="mni-profile"><Select id="mni-profile" value={f.authProfile} onChange={set("authProfile")}><option value="STATIC">Credencial estática do serviço</option>{f.system === "projudi" && f.jtr === "8.16" ? <option value="TJPR_SCMPP">SCMPP/TJPR — código privado, senha diária</option> : null}</Select></Field>
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
      <Field label="URL do WSDL (opcional)" htmlFor="mni-wsdl" hint="Se o contrato estiver em outro caminho na mesma origem do serviço, informe a URL exata. Vazio consulta ?wsdl."><Input id="mni-wsdl" value={f.wsdlUrl} onChange={set("wsdlUrl")} /></Field>
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
      <Field label={f.system === "pje-mni" ? "CPF/CNPJ do advogado (login do PJe)" : "Identificador do usuário de integração"} htmlFor="mni-doc">
        <Input id="mni-doc" value={f.document} onChange={set("document")} autoComplete="off" />
      </Field>
      {needsPassword ? (
        <Field label={f.authProfile === "TJPR_SCMPP" ? "Código privado fornecido pelo TJPR" : f.system === "pje-mni" ? "Senha do PJe" : "Senha do serviço de integração"} htmlFor="mni-pass" hint="Guardada cifrada; nunca é exibida de novo.">
          <Input id="mni-pass" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
      ) : null}
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setOk(false);
            const r = await createConnectionAction({ ...f, system: f.system as "pje-mni" | "eproc" | "esaj" | "projudi", environment: f.environment as "HOMOLOGATION" | "PRODUCTION", authProfile: f.authProfile as "STATIC" | "TJPR_SCMPP", authMode: f.authMode as "PASSWORD" | "CERTIFICATE" | "PASSWORD_AND_CERTIFICATE" });
            if (!r.ok) return setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível cadastrar.");
            setError(null);
            setOk(true);
            setF((p) => ({ ...p, password: "", label: "", endpointUrl: "", wsdlUrl: "", document: "" }));
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

export function MniAutosButton({ caseId }: { caseId: string; label: string }) {
  return <AutosQueue caseId={caseId} canWrite />;
}

export function OfficialTargetsForm({ certificates }: { certificates: { id: string; label: string }[] }) {
  const router = useRouter(); const [pending, start] = React.useTransition(); const [message, setMessage] = React.useState<string>();
  return <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-medium">Preparar destinos MNI com endereços oficiais</summary><form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); const fd = new FormData(event.currentTarget); setMessage(undefined); start(async () => { const res = await prepareOfficialTargetsAction({ certificateId: String(fd.get("certificateId")), document: String(fd.get("document")), keys: fd.getAll("keys").map(String) }); if (!res.ok) setMessage(res.message ?? "Confira o certificado, CPF e destinos."); else { setMessage(`${res.data?.created ?? 0} conexão(ões) preparada(s); ${res.data?.existing ?? 0} já existente(s). Novas conexões ficaram desligadas, aguardando verificação e autorização.`); router.refresh(); } }); }}>
    <p className="text-xs text-muted">Catálogo inicial: TRF1, TJBA, TJPE, TRT6 e TRT15, com serviços publicados pelos próprios tribunais. Preparar não autentica: MNI pode exigir convênio, liberação de IP e credenciais específicas. Não abrange todos os tribunais brasileiros.</p>
    <Field label="Certificado para consultas" htmlFor="official-cert"><Select id="official-cert" name="certificateId" required><option value="">Escolha o certificado</option>{certificates.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
    <Field label="CPF do titular para os destinos selecionados" htmlFor="official-cpf"><Input id="official-cpf" name="document" required inputMode="numeric" maxLength={14} autoComplete="off" /></Field>
    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Destinos para preparar</legend>{OFFICIAL_MNI_TARGETS.map(target => <div key={target.key} className="flex items-start gap-2 text-xs"><label className="flex flex-1 gap-2"><input type="checkbox" name="keys" value={target.key} defaultChecked />{target.label}</label><a href={target.source} target="_blank" rel="noreferrer" className="underline">Fonte oficial</a></div>)}</fieldset>
    <p className="text-xs text-muted">O certificado será limitado a consultas. Cadastros existentes são preservados; novos ficam desligados. Nenhum processo é consultado ou alterado ao preparar.</p>
    {message ? <p role="status" className="text-sm">{message}</p> : null}<Button type="submit" loading={pending}>Preparar conexões somente consulta</Button>
  </form></details>;
}
