"use client";

import { ProviderForm } from "./provider-form";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import {
  approveProposalAction, createMcpKeyAction, rejectProposalAction, revokeConnectionAction, setEmergencyStopAction, setFeatureAction, testMcpAction, updateProposalAction,
} from "./actions";

// ----------------------------------------------------------------- Situação
export type SettingsView = { mcpEnabled: boolean; proposalsEnabled: boolean; assistantEnabled: boolean; provider: string; model: string | null; hasOfficeKey: boolean; emergencyStop: boolean; consentAt: string | null };

function FeatureRow({ feature, label, hint, on, needConsent, disabled }: { feature: "mcp" | "proposals" | "assistant"; label: string; hint: string; on: boolean; needConsent?: boolean; disabled: boolean }) {
  const { run, pending, error } = useRun();
  const [consent, setConsent] = React.useState(false);
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label} <Badge tone={on ? "success" : "neutral"}>{on ? "Ligado" : "Desligado"}</Badge></p>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
        {!disabled ? (
          <Button size="sm" variant={on ? "secondary" : "primary"} loading={pending} disabled={!on && needConsent && !consent} onClick={() => run(() => setFeatureAction({ feature, on: !on, consent }))}>
            {on ? "Desligar" : "Ligar"}
          </Button>
        ) : null}
      </div>
      {!disabled && !on && needConsent ? (
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Entendo que o conteúdo consultado pela IA (processos, clientes, prazos, intimações) sai do LegalOS para a IA que a pessoa conectar. CPF, CNPJ e e-mails são ocultados. Cada pessoa só alcança o que já pode ver.</span>
        </label>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}

export function SettingsPanel({ s, canManage }: { s: SettingsView; canManage: boolean }) {
  const stop = useRun();
  return (
    <div className="space-y-4">
      {s.emergencyStop ? <Alert tone="error">PARADA DE EMERGÊNCIA ATIVA: conexões externas, assistente e novas propostas estão bloqueados.</Alert> : null}
      <div className="space-y-3">
        <FeatureRow feature="mcp" label="Conectar IAs externas (Claude, ChatGPT, Gemini)" hint="Libera o servidor MCP: a IA consulta e propõe, como a pessoa que conectou." on={s.mcpEnabled} needConsent disabled={!canManage} />
        <FeatureRow feature="proposals" label="Propostas da IA" hint="A IA registra propostas (tarefa, prazo, anotação, minuta…). Nada vale até uma pessoa confirmar." on={s.proposalsEnabled} disabled={!canManage} />
        <FeatureRow feature="assistant" label="Assistente embutido" hint="Conversa dentro do LegalOS, com a IA do escritório. Só consulta e propõe." on={s.assistantEnabled} disabled={!canManage} />
      </div>
      {canManage ? (
        <>
          <ProviderForm provider={s.provider} model={s.model} hasOfficeKey={s.hasOfficeKey} />
          <div className="space-y-2 rounded-md border border-danger/40 p-3">
            <p className="text-sm font-medium">Parada de emergência</p>
            <p className="text-xs text-muted">Corta na hora as conexões externas, o assistente e as novas propostas. Propostas já feitas continuam podendo ser decididas por pessoas.</p>
            {stop.error ? <Alert tone="error">{stop.error}</Alert> : null}
            <Button size="sm" variant={s.emergencyStop ? "secondary" : "danger"} loading={stop.pending} onClick={() => stop.run(() => setEmergencyStopAction(!s.emergencyStop))}>
              {s.emergencyStop ? "Liberar a RUTE" : "Parar tudo agora"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------- Conexões
function Copy({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setOk(true), () => undefined); }}>{ok ? "Copiado" : label}</Button>
  );
}

export function ConnectGuide({ mcpUrl, enabled }: { mcpUrl: string; enabled: boolean }) {
  const gemini = JSON.stringify({ mcpServers: { legalos: { httpUrl: mcpUrl, headers: { Authorization: "Bearer COLE_AQUI_A_CHAVE" } } } }, null, 2);
  return (
    <div className="space-y-4 text-sm">
      {!enabled ? <Alert tone="warning">A conexão de IAs externas está desligada. Quem administra liga em Situação.</Alert> : null}
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-3">
        <span className="text-xs text-muted">Endereço do servidor:</span>
        <code className="break-all text-xs">{mcpUrl}</code>
        <Copy text={mcpUrl} />
      </div>
      <div>
        <p className="font-medium">Claude (claude.ai)</p>
        <ol className="ml-5 list-decimal space-y-1 text-muted">
          <li>No Claude, abra Configurações → Conectores e escolha adicionar um conector personalizado.</li>
          <li>Cole o endereço acima e conclua. O Claude abre uma tela do LegalOS pedindo a sua permissão.</li>
          <li>Entre no LegalOS (se pedir), escolha os acessos e clique em Permitir.</li>
        </ol>
      </div>
      <div>
        <p className="font-medium">ChatGPT</p>
        <ol className="ml-5 list-decimal space-y-1 text-muted">
          <li>No ChatGPT, ative o modo desenvolvedor em Configurações → Conectores (avançado) e crie um conector novo.</li>
          <li>Cole o endereço acima e escolha autenticação OAuth.</li>
          <li>Autorize na tela do LegalOS.</li>
        </ol>
      </div>
      <div>
        <p className="font-medium">Gemini (linha de comando) e Claude Code</p>
        <ol className="ml-5 list-decimal space-y-1 text-muted">
          <li>Crie uma chave aqui embaixo (aparece uma única vez).</li>
          <li>No Gemini CLI, coloque no arquivo de configurações o trecho abaixo, trocando a chave.</li>
        </ol>
        <pre className="mt-2 overflow-x-auto rounded-md bg-surface-2 p-3 text-xs">{gemini}</pre>
        <Copy text={gemini} label="Copiar trecho" />
      </div>
      <p className="text-xs text-muted">Os nomes dos menus nos aplicativos de IA podem mudar com o tempo; o endereço e a autorização são sempre os mesmos. Conexões de IA só funcionam para pessoas com a verificação em duas etapas ativada.</p>
    </div>
  );
}

export function KeyForm() {
  const { run, pending, error } = useRun();
  const [token, setToken] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      <form
        className="grid gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const days = String(fd.get("days") ?? "");
          run(() => createMcpKeyAction({ name: String(fd.get("name")), propose: fd.get("propose") === "on", expiresInDays: days ? Number(days) : null }), undefined, (d) => d && setToken(d.token));
        }}
      >
        <div className="sm:col-span-2"><Field label="Nome da chave" htmlFor="kf-n"><Input id="kf-n" name="name" required minLength={3} maxLength={80} placeholder="Ex.: Gemini da Dra. Talita" /></Field></div>
        <Field label="Validade (dias)" htmlFor="kf-d" hint="Vazio = sem validade."><Input id="kf-d" name="days" type="number" min={1} max={730} /></Field>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="propose" />Também propor</label>
          <Button type="submit" size="sm" loading={pending}>Criar chave</Button>
        </div>
      </form>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {token ? (
        <Alert tone="success">
          <span>Chave criada. Copie agora: ela não será mostrada de novo.<br /><code className="break-all text-xs">{token}</code></span>
        </Alert>
      ) : null}
      {token ? <Copy text={token} label="Copiar chave" /> : null}
    </div>
  );
}

export type ConnView = { id: string; kind: "OAUTH" | "KEY"; name: string; scopes: string[]; userName: string | null; lastUsedAt: string | null; createdAt: string; status: "ACTIVE" | "REVOKED" | "EXPIRED" };

export function ConnectionList({ items }: { items: ConnView[] }) {
  const { run, pending, error } = useRun();
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {items.length === 0 ? <p className="p-4 text-center text-sm text-muted">Nenhuma conexão ainda.</p> : null}
      <ul className="divide-y divide-border">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              <p className="font-medium">{c.name} <Badge tone="neutral">{c.kind === "KEY" ? "Chave" : "Login (OAuth)"}</Badge> <Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{c.status === "ACTIVE" ? "Ativa" : c.status === "REVOKED" ? "Revogada" : "Expirada"}</Badge></p>
              <p className="text-xs text-muted">{c.userName ? `Pessoa: ${c.userName} · ` : ""}{c.scopes.includes("mcp:propose") ? "consulta + propõe" : "só consulta"} · último uso: {c.lastUsedAt ?? "nunca"}</p>
            </div>
            {c.status === "ACTIVE" ? <Button size="sm" variant="danger" loading={pending} onClick={() => run(() => revokeConnectionAction(c.id))}>Revogar</Button> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TestButton() {
  const { run, pending, error, done } = useRun();
  const [info, setInfo] = React.useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => testMcpAction(), "Conexão funcionando.", (d) => d && setInfo(`${d.tools} ferramentas disponíveis para o seu perfil.`))}>Testar conexão</Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done} {info}</Alert> : null}
    </div>
  );
}

// ----------------------------------------------------------------- Propostas
export type ProposalItem = { id: string; kindLabel: string; risk: "LOW" | "HIGH"; title: string; payload: Record<string, unknown>; via: string; connection: string | null; caseTitle: string | null; status: string; proposerName: string; createdAt: string; expiresAt: string; decisionNote: string | null };
const EDITABLE = ["title", "text", "body", "description", "notes"] as const;
const LABELS: Record<string, string> = { title: "Título", text: "Texto", body: "Texto", description: "Descrição", notes: "Observações", priority: "Prioridade", dueDate: "Vencimento", startDate: "Início", days: "Dias", countType: "Contagem", kind: "Tipo", caseId: "Processo (id)", petitionId: "Petição (id)", assigneeId: "Responsável (id)", clientId: "Cliente (id)" };
const STATUS = { PENDING: "Aguardando", APPROVED: "Aprovada", REJECTED: "Recusada", EXPIRED: "Expirada", FAILED: "Falhou" } as const;

function ProposalCard({ p }: { p: ProposalItem }) {
  const { run, pending, error } = useRun();
  const [edit, setEdit] = React.useState<Record<string, string>>({});
  const [confirm, setConfirm] = React.useState(false);
  const [note, setNote] = React.useState("");
  const open = p.status === "PENDING";
  const edited = (): Record<string, unknown> | undefined => (Object.keys(edit).length ? { ...edit } : undefined);
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{p.title} <Badge tone={p.risk === "HIGH" ? "warning" : "neutral"}>{p.kindLabel}</Badge> <Badge tone={p.status === "APPROVED" ? "success" : p.status === "PENDING" ? "info" : "neutral"}>{STATUS[p.status as keyof typeof STATUS] ?? p.status}</Badge></p>
          <p className="text-xs text-muted">Proposta de {p.proposerName} via {p.via === "MCP" ? p.connection ?? "IA externa" : "assistente"}{p.caseTitle ? ` · processo: ${p.caseTitle}` : ""} · vale até {p.expiresAt}</p>
        </div>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[10rem_1fr]">
        {Object.entries(p.payload).filter(([k, v]) => v !== "" && v !== null && v !== undefined && !/Id$/.test(k) && k !== "petitionTitle").map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-muted">{LABELS[k] ?? k}</dt>
            <dd>
              {open && (EDITABLE as readonly string[]).includes(k) ? (
                String(v).length > 120 || k === "text" || k === "body" ? (
                  <Textarea rows={6} defaultValue={String(v)} onChange={(e) => setEdit((cur) => ({ ...cur, [k]: e.target.value }))} />
                ) : (
                  <Input defaultValue={String(v)} onChange={(e) => setEdit((cur) => ({ ...cur, [k]: e.target.value }))} />
                )
              ) : (
                <span className="whitespace-pre-wrap break-words">{String(v)}</span>
              )}
            </dd>
          </React.Fragment>
        ))}
      </dl>
      {p.decisionNote ? <p className="text-xs text-muted">Motivo: {p.decisionNote}</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {open ? (
        <div className="space-y-2">
          {p.risk === "HIGH" ? (
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /><span>Revisei todo o conteúdo e sei que esta é uma ação de maior risco. Isto não protocola nada: só prepara para revisão.</span></label>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" loading={pending} disabled={p.risk === "HIGH" && !confirm} onClick={() => run(() => approveProposalAction(p.id, { confirmHighRisk: confirm, edited: edited() }))}>Aprovar e executar</Button>
            {Object.keys(edit).length ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => updateProposalAction(p.id, edit))}>Salvar edição</Button> : null}
            <Input className="max-w-xs" placeholder="Motivo da recusa (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <Button size="sm" variant="danger" loading={pending} onClick={() => run(() => rejectProposalAction(p.id, note))}>Recusar</Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function ProposalList({ items }: { items: ProposalItem[] }) {
  if (items.length === 0) return <p className="p-6 text-center text-sm text-muted">Nenhuma proposta por aqui.</p>;
  return <ul className="divide-y divide-border px-4">{items.map((p) => <ProposalCard key={p.id + p.status} p={p} />)}</ul>;
}
