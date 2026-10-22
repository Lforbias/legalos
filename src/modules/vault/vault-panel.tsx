"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { createRoleFromTemplateAction, deleteCredentialAction, revealCredentialAction, saveCredentialAction } from "./actions";

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
export type CredentialView = { id: string; system: string; label: string; updatedAt: string; lastRevealedAt: string | null; lastRevealedBy: string | null };

export function VaultPanel({ clientId, items, systems, canRead, canManage }: { clientId: string; items: CredentialView[]; systems: readonly string[]; canRead: boolean; canManage: boolean }) {
  const { run, pending, error, done } = useRun();
  const [adding, setAdding] = React.useState(false);
  const [f, setF] = React.useState({ system: systems[0] ?? "", label: "", login: "", password: "", notes: "" });
  const [open, setOpen] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [shown, setShown] = React.useState<{ id: string; login: string; password: string; notes: string } | null>(null);
  const [rerr, setRerr] = React.useState<string | null>(null);
  const [busy, start] = React.useTransition();
  React.useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 60_000); // some da tela sozinha em 1 minuto
    return () => clearTimeout(t);
  }, [shown]);
  const reveal = (id: string) => start(async () => {
    setRerr(null);
    const r = await revealCredentialAction(clientId, id, code);
    if (r.ok && r.data) { setShown({ id, ...r.data }); setOpen(null); setCode(""); }
    else setRerr(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível abrir.");
  });
  return (
    <div className="space-y-3 text-sm" data-testid="vault-panel">
      <Alert tone="info">As senhas ficam cifradas. Para ver uma senha é preciso digitar o <strong>código do 2FA</strong> na hora, e cada abertura fica registrada (quem e quando). A senha some da tela em 1 minuto. Guarde aqui apenas o que o escritório precisa para atender o cliente.</Alert>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      {items.length === 0 ? <p className="text-muted">Nenhuma credencial guardada para este cliente.</p> : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((c) => (
            <li key={c.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><span className="font-medium">{c.label}</span> <Badge tone="neutral">{c.system}</Badge>
                  <div className="text-xs text-muted">{c.lastRevealedAt ? `Última abertura: ${c.lastRevealedBy ?? "—"} em ${fmt(c.lastRevealedAt)}` : "Nunca aberta"}</div></div>
                <div className="flex gap-2">
                  {canRead ? <Button size="sm" variant="secondary" onClick={() => { setOpen(open === c.id ? null : c.id); setRerr(null); setCode(""); }}>Ver senha</Button> : null}
                  {canManage ? <Button size="sm" variant="danger" loading={pending} onClick={() => { if (window.confirm("Apagar esta credencial? Não dá para desfazer.")) run(() => deleteCredentialAction(clientId, c.id), "Credencial apagada."); }}>Apagar</Button> : null}
                </div>
              </div>
              {open === c.id ? (
                <div className="flex flex-wrap items-end gap-2 rounded-md bg-surface-2 p-2">
                  <Field label="Código do 2FA (6 dígitos) ou de recuperação" htmlFor={`vc-${c.id}`}><Input id={`vc-${c.id}`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
                  <Button size="sm" loading={busy} disabled={!code.trim()} onClick={() => reveal(c.id)}>Abrir</Button>
                  {rerr ? <p className="w-full text-xs text-danger" role="alert">{rerr}</p> : null}
                </div>
              ) : null}
              {shown?.id === c.id ? (
                <dl className="space-y-1 rounded-md border border-border p-2" data-testid="vault-secret">
                  <div><dt className="text-xs text-muted">Usuário / CPF</dt><dd className="font-mono">{shown.login}</dd></div>
                  <div><dt className="text-xs text-muted">Senha</dt><dd className="font-mono">{shown.password}</dd></div>
                  {shown.notes ? <div><dt className="text-xs text-muted">Observações</dt><dd>{shown.notes}</dd></div> : null}
                  <Button size="sm" variant="secondary" onClick={() => setShown(null)}>Esconder</Button>
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        adding ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Sistema" htmlFor="vc-sys"><Select id="vc-sys" value={f.system} onChange={(e) => setF({ ...f, system: e.target.value })}>{systems.map((s) => <option key={s}>{s}</option>)}</Select></Field>
              <Field label="Nome (ex.: Meu INSS da Maria)" htmlFor="vc-label"><Input id="vc-label" maxLength={80} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
              <Field label="Usuário ou CPF de acesso" htmlFor="vc-login"><Input id="vc-login" autoComplete="off" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} /></Field>
              <Field label="Senha" htmlFor="vc-pass"><Input id="vc-pass" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            </div>
            <Field label="Observações (opcional, ex.: pergunta de segurança)" htmlFor="vc-notes"><Textarea id="vc-notes" rows={2} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <div className="flex gap-2">
              <Button loading={pending} onClick={() => run(() => saveCredentialAction(clientId, null, f), "Credencial guardada.", () => { setAdding(false); setF({ system: systems[0] ?? "", label: "", login: "", password: "", notes: "" }); })}>Guardar</Button>
              <Button variant="secondary" onClick={() => setAdding(false)}>Cancelar</Button>
            </div>
          </div>
        ) : <Button size="sm" onClick={() => setAdding(true)}>Guardar nova credencial</Button>
      ) : null}
    </div>
  );
}

export type TemplateView = { key: string; name: string; description: string };
export type ReviewRow = { userId: string; name: string; email: string; role: string; sensitive: string[]; mfaEnabled: boolean; atRisk: boolean };

export function AccessTools({ templates, review, existing, canManage }: { templates: TemplateView[]; review: ReviewRow[] | null; existing: string[]; canManage: boolean }) {
  const { run, pending, error, done } = useRun();
  return (
    <div className="mt-6 space-y-6 text-sm" data-testid="access-tools">
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Modelos com o mínimo de acesso</h2>
        <p className="text-muted">Cada modelo cria um perfil personalizado só com o necessário para a função. Depois você pode ajustar.</p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {done ? <Alert tone="success">{done}</Alert> : null}
        <ul className="divide-y divide-border rounded-md border border-border">
          {templates.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0"><div className="font-medium">{t.name}</div><p className="text-xs text-muted">{t.description}</p></div>
              {existing.includes(t.name) ? <Badge tone="success">Já criado</Badge> : canManage ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => createRoleFromTemplateAction(t.key), `Perfil “${t.name}” criado.`)}>Criar perfil</Button> : null}
            </li>
          ))}
        </ul>
      </section>
      {review ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Revisão de acessos sensíveis</h2>
          <p className="text-muted">Quem pode ver senhas, mexer em dinheiro, acessos ou integrações. Quem aparece em vermelho tem acesso sensível e <strong>não ativou o 2FA</strong>.</p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2"><tr><th className="p-2">Pessoa</th><th className="p-2">Perfil</th><th className="p-2">Acessos sensíveis</th><th className="p-2">2FA</th></tr></thead>
              <tbody>
                {review.map((r) => (
                  <tr key={r.userId} className={r.atRisk ? "bg-danger/10" : ""}>
                    <td className="p-2">{r.name}<div className="text-muted">{r.email}</div></td>
                    <td className="p-2">{r.role}</td>
                    <td className="p-2">{r.sensitive.length ? r.sensitive.join(", ") : "—"}</td>
                    <td className="p-2">{r.mfaEnabled ? "Ligado" : "Desligado"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
