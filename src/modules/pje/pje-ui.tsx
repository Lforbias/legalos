"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { ClientPicker } from "@/modules/clients/client-picker";
import { CASE_AREAS } from "@/modules/cases/schemas";
import { createBridgeKeyAction, revokeBridgeKeyAction, saveOtpAction, revealOtpAction, revokeOtpAction, receiveDiscoveryAction, ignoreDiscoveryAction, linkDiscoveryAction } from "./actions";

export function OtpSetup() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault(); const element = event.currentTarget; const fd = new FormData(element); setMessage(undefined);
    const input = Object.fromEntries(fd.entries());
    start(async () => { const res = await saveOtpAction(input); if (!res.ok) setMessage(res.message ?? Object.values(res.fieldErrors ?? {}).flat()[0]); else { element.reset(); setMessage("Autenticador cadastrado. Use Gerar código na lista abaixo."); router.refresh(); } });
  }}>
    <p className="text-sm text-muted">Cadastre a chave manual ou o endereço otpauth do seu autenticador PJe/Jus.br. Ela precisa ser a mesma chave registrada no tribunal; um certificado não contém essa chave. Compatível com TOTP SHA1, 6 dígitos e 30 segundos.</p>
    <Field label="Nome" htmlFor="otp-label"><Input id="otp-label" name="label" required minLength={3} maxLength={80} placeholder="Meu acesso PJe / Jus.br" /></Field>
    <Field label="Chave do autenticador do tribunal" htmlFor="otp-secret" hint="Chave Base32 ou endereço otpauth. Ela é cifrada e não volta para a tela."><Input id="otp-secret" name="secret" type="password" required maxLength={2048} autoComplete="off" /></Field>
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Código atual do autenticador do tribunal" htmlFor="otp-confirm"><Input id="otp-confirm" name="confirmationCode" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" /></Field>
      <Field label="Código do seu 2FA do LegalOS" htmlFor="otp-authorize" hint="Confirma sua identidade no LegalOS; é diferente do código do tribunal."><Input id="otp-authorize" name="authorizationCode" required type="password" maxLength={30} autoComplete="one-time-code" /></Field>
    </div>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    <Button type="submit" loading={pending}>Cadastrar autenticador</Button>
  </form>;
}

export function OtpCode({ id, label }: { id: string; label: string }) {
  const router = useRouter(); const [authorization, setAuthorization] = useState("");
  const [result, setResult] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string>(); const [pending, start] = useTransition();
  useEffect(() => {
    if (!result) return;
    const hide = () => setResult(null);
    const timer = setTimeout(hide, Math.max(0, Date.parse(result.expiresAt) - Date.now()));
    const onHide = () => { if (document.hidden) hide(); };
    document.addEventListener("visibilitychange", onHide); window.addEventListener("pagehide", hide);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", hide); };
  }, [result]);
  return <div className="space-y-3 rounded-xl border border-border p-4">
    <h3 className="font-medium">{label}</h3>
    <Field label="2FA do LegalOS para gerar ou remover" htmlFor={`otp-auth-${id}`}><Input id={`otp-auth-${id}`} value={authorization} onChange={e => setAuthorization(e.target.value)} type="password" autoComplete="one-time-code" maxLength={30} disabled={pending} /></Field>
    {result ? <div aria-live="polite"><p className="font-mono text-3xl tracking-[0.3em]">{result.code}</p><p className="text-xs text-muted">Código do tribunal. Expira às {new Date(result.expiresAt).toLocaleTimeString("pt-BR")}. Digite no próprio PJe/Jus.br.</p><Button size="sm" variant="ghost" onClick={() => setResult(null)}>Ocultar</Button></div> : null}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <div className="flex gap-2">
      <Button loading={pending} disabled={!authorization} onClick={() => { const code = authorization; setAuthorization(""); setError(undefined); setResult(null); start(async () => { const res = await revealOtpAction(id, code); if (!res.ok) setError(res.message); else if (res.data && !document.hidden && Date.parse(res.data.expiresAt) > Date.now()) setResult(res.data); }); }}>Gerar código</Button>
      <Button variant="ghost" disabled={pending || !authorization} onClick={() => { if (!window.confirm("Remover a cópia deste autenticador do LegalOS? Ele continuará ativo no tribunal. Mantenha seu aplicativo autenticador disponível.")) return; const code = authorization; setAuthorization(""); setResult(null); setError(undefined); start(async () => { const res = await revokeOtpAction(id, code); if (!res.ok) setError(res.message); else router.refresh(); }); }}>Remover do LegalOS</Button>
    </div>
  </div>;
}

type CaseOption = { id: string; title: string; number: string | null };
export function DiscoveryRow({ row, cases, canCreate }: { row: { id: string; number: string; sourceOrigin: string }; cases: CaseOption[]; canCreate: boolean }) {
  const router = useRouter(); const [caseId, setCaseId] = useState(""); const [clientId, setClientId] = useState(""); const [clientLabel, setClientLabel] = useState(""); const [error, setError] = useState<string>(); const [pending, start] = useTransition();
  return <Card><CardHeader title={row.number} description={`Informado/detectado em ${row.sourceOrigin}. Confirme se pertence ao cliente e ao caso escolhido.`} /><CardBody>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); const fd = new FormData(event.currentTarget); setError(undefined); start(async () => { const res = await linkDiscoveryAction({ id: row.id, caseId, clientId, title: String(fd.get("title") ?? ""), area: String(fd.get("area") ?? "") }); if (!res.ok) setError(res.message); else if (res.data) { router.push(`/processos/${res.data.caseId}`); router.refresh(); } }); }}>
      <Field label="Vincular a um caso existente" htmlFor={`case-${row.id}`} hint="Até 200 cadastros recentes visíveis a você. O CNJ será adicionado ao caso, preservando seus dados."><Select id={`case-${row.id}`} value={caseId} onChange={e => setCaseId(e.target.value)} disabled={pending}><option value="">Criar novo cadastro / reconhecer CNJ já cadastrado</option>{cases.filter(c => !c.number || c.number === row.number).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
      {!caseId && canCreate ? <>
        <Field label="Cliente do novo processo" htmlFor={`client-${row.id}`}><ClientPicker id={`client-${row.id}`} value={clientId} label={clientLabel} disabled={pending} onChange={(id, label) => { setClientId(id); setClientLabel(label); }} /></Field>
        <Field label="Título (opcional)" htmlFor={`title-${row.id}`}><Input id={`title-${row.id}`} name="title" maxLength={200} /></Field>
        <Field label="Área jurídica" htmlFor={`area-${row.id}`}><Select id={`area-${row.id}`} name="area"><option value="">Escolher depois</option>{CASE_AREAS.map(a => <option key={a}>{a}</option>)}</Select></Field>
        <p className="text-xs text-muted">Novos cadastros começam sigilosos. Se o CNJ já existir e você tiver acesso, será aberto o cadastro existente, sem trocar seu cliente.</p>
      </> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex gap-2"><Button type="submit" loading={pending}>Conferi: vincular ou cadastrar</Button><Button variant="ghost" disabled={pending} onClick={() => { setError(undefined); start(async () => { const res = await ignoreDiscoveryAction(row.id); if (!res.ok) setError(res.message); else router.refresh(); }); }}>Ignorar</Button></div>
    </form>
  </CardBody></Card>;
}

export function ManualDiscovery() {
  const router = useRouter(); const [message, setMessage] = useState<string>(); const [pending, start] = useTransition();
  return <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Informar um CNJ manualmente</summary><form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); const element = event.currentTarget; const fd = new FormData(element); setMessage(undefined); start(async () => { const res = await receiveDiscoveryAction({ sourceOrigin: String(fd.get("sourceOrigin")), numbers: [String(fd.get("number"))] }); if (!res.ok) setMessage(res.message ?? "Confira o número e a origem HTTPS do tribunal."); else { element.reset(); setMessage("Recebido para conferência."); router.refresh(); } }); }}>
    <Field label="Número CNJ" htmlFor="manual-cnj"><Input id="manual-cnj" name="number" required maxLength={30} /></Field>
    <Field label="Origem do tribunal (sem caminho)" htmlFor="manual-origin"><Input id="manual-origin" name="sourceOrigin" type="url" placeholder="https://pje.tjba.jus.br" required /></Field>
    {message ? <p role="status" className="text-sm">{message}</p> : null}<Button type="submit" loading={pending}>Adicionar à conferência</Button>
  </form></details>;
}

export function PersonalBridgeKeys({ items }: { items: { id: string; prefix: string; expiresAt: string | null }[] }) {
  const router = useRouter(); const [token, setToken] = useState<string>(); const [error, setError] = useState<string>(); const [pending, start] = useTransition();
  return <div className="space-y-3 rounded-lg border border-border p-4">
    <p className="text-sm">Crie sua conexão pessoal para a extensão. Ela expira em 90 dias e só registra CNJs para conferência; não lê clientes, não gera OTP e não executa ferramentas da RUTE.</p>
    <Button disabled={pending} onClick={() => { setError(undefined); setToken(undefined); start(async () => { const res = await createBridgeKeyAction(); if (!res.ok) setError(res.message); else { setToken(res.data?.token); router.refresh(); } }); }}>Criar conexão pessoal</Button>
    {token ? <div><p className="text-xs text-muted">Copie para a extensão. Esta chave só aparece agora.</p><Input aria-label="Chave pessoal da extensão" readOnly value={token} onFocus={e => e.target.select()} /><Button size="sm" variant="ghost" onClick={() => setToken(undefined)}>Já copiei: ocultar</Button></div> : null}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {items.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>Conexão {item.prefix} · {item.expiresAt ? `expira em ${new Date(item.expiresAt).toLocaleDateString("pt-BR")}` : "sem expiração"}</span><Button size="sm" variant="ghost" disabled={pending} onClick={() => { start(async () => { const res = await revokeBridgeKeyAction(item.id); if (!res.ok) setError(res.message); else { setToken(undefined); router.refresh(); } }); }}>Revogar conexão</Button></div>)}
  </div>;
}
