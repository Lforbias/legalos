"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input } from "@/components/ui/form";
import { connectPjeAction, deletePortalAccessAction, setPortalAccessEnabledAction, testPortalAccessAction } from "./actions";

export type PortalRowView = {
  id: string;
  targetLabel: string;
  status: string;
  enabled: boolean;
  statusMessage: string | null;
  documentHint: string;
  hasOtp: boolean;
  lastLogin: string | null;
  technical: string | null;
};

const BUSY = new Set(["PENDING", "CONNECTING"]);

function statusBadge(r: PortalRowView) {
  if (!r.enabled) return <Badge tone="neutral">Desligado</Badge>;
  switch (r.status) {
    case "CONNECTED": return <Badge tone="success">Conectado</Badge>;
    case "PENDING":
    case "CONNECTING": return <Badge tone="info">Conectando…</Badge>;
    case "NEEDS_ACTION": return <Badge tone="warning">Precisa da sua ação</Badge>;
    default: return <Badge tone="danger">Não conectou</Badge>;
  }
}

/** Lê o QR Code do autenticador direto no navegador: a imagem NUNCA sai deste computador, só o texto da chave vai (cifrado) ao salvar. */
async function readQr(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c2d = canvas.getContext("2d", { willReadFrequently: true });
  if (!c2d) throw new Error("Seu navegador não conseguiu abrir a imagem.");
  c2d.drawImage(bitmap, 0, 0, w, h);
  const { default: jsQR } = await import("jsqr");
  const found = jsQR(c2d.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
  if (!found) throw new Error("Não consegui ler o QR Code nesta imagem. Tente um print mais nítido ou cole a chave em texto.");
  if (!found.data.startsWith("otpauth://")) throw new Error("Esse QR Code não é de um autenticador (2º fator).");
  return found.data;
}

export function PjeConnectForm({ targets, hasAccess }: { targets: { key: string; label: string }[]; hasAccess: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasAccess);
  const [chosen, setChosen] = useState<string[]>([]);
  const [document_, setDocument] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpNote, setOtpNote] = useState<string>();
  const [otpMode, setOtpMode] = useState<"none" | "qr" | "key">("none");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (key: string) => setChosen((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  if (!open) {
    return <Button variant="secondary" onClick={() => setOpen(true)}>Atualizar senha ou adicionar tribunal</Button>;
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(undefined);
        setDone(undefined);
        start(async () => {
          const res = await connectPjeAction({ targets: chosen, document: document_, password, ...(otp.trim() ? { otp: otp.trim() } : {}) });
          if (!res.ok) {
            setError(res.message ?? Object.values(res.fieldErrors ?? {}).flat()[0] ?? "Não foi possível salvar.");
            return;
          }
          setPassword("");
          setOtp("");
          setOtpNote(undefined);
          setOtpMode("none");
          setDone("Salvo. O LegalOS está entrando no PJe agora; o resultado aparece logo abaixo em cerca de um minuto.");
          router.refresh();
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-fg/85">Em quais tribunais você tem acesso ao PJe?</legend>
        <div className="flex flex-wrap gap-3">
          {targets.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={chosen.includes(t.key)} onChange={() => toggle(t.key)} disabled={pending} />
              {t.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">Mais tribunais serão liberados conforme forem validados, um por vez.</p>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="CPF (ou CNPJ) do seu login no PJe" htmlFor="pje-doc"><Input id="pje-doc" value={document_} onChange={(e) => setDocument(e.target.value)} required inputMode="numeric" autoComplete="off" maxLength={20} disabled={pending} placeholder="000.000.000-00" /></Field>
        <Field label="Senha do PJe" htmlFor="pje-pass" hint="Guardada cifrada. Ela nunca volta para a tela."><Input id="pje-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" maxLength={200} disabled={pending} /></Field>
      </div>

      <div className="space-y-2 rounded-xl border border-border p-3">
        <p className="text-[13px] font-medium text-fg/85">Código de segurança do celular (2º fator) <span className="font-normal text-muted">— só se o seu PJe pede</span></p>
        <p className="text-xs text-muted">No PJe, em &ldquo;Autenticação em dois fatores&rdquo;, ao cadastrar o aplicativo aparece um QR Code. Tire um print dele e envie aqui (a imagem é lida no seu computador e não é enviada) ou cole a chave em texto.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>Enviar print do QR Code</Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { setOtpMode(otpMode === "key" ? "none" : "key"); setOtpNote(undefined); }}>Colar a chave</Button>
          {otp ? <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { setOtp(""); setOtpNote(undefined); setOtpMode("none"); }}>Limpar</Button> : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError(undefined);
            try {
              setOtp(await readQr(file));
              setOtpMode("qr");
              setOtpNote("QR Code lido. A chave ficou guardada neste formulário e será cifrada ao salvar.");
            } catch (err) {
              setOtp("");
              setOtpNote(undefined);
              setError(err instanceof Error ? err.message : "Não consegui ler o QR Code.");
            }
          }}
        />
        {otpMode === "key" ? <Input aria-label="Chave do autenticador" type="password" value={otp} onChange={(e) => setOtp(e.target.value)} autoComplete="off" maxLength={2048} placeholder="Chave em texto (letras e números)" disabled={pending} /> : null}
        {otpNote ? <p role="status" className="text-xs text-success">{otpNote}</p> : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} disabled={!chosen.length || !document_ || !password}>Salvar e conectar</Button>
        {hasAccess ? <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Fechar</Button> : null}
      </div>
      <p className="text-xs text-muted">O LegalOS só entra para ler. Não protocola, não dá ciência e não abre intimação por você. Se o PJe pedir verificação de segurança (captcha) ou bloquear a conta, o robô para e avisa.</p>
    </form>
  );
}

export function PortalAccessList({ rows }: { rows: PortalRowView[] }) {
  const router = useRouter();
  const busy = rows.some((r) => r.enabled && BUSY.has(r.status));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [busy, router]);
  if (!rows.length) return null;
  return <div className="space-y-3">{rows.map((r) => <PortalAccessRow key={r.id} r={r} />)}</div>;
}

function PortalAccessRow({ r }: { r: PortalRowView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) => { setError(undefined); start(async () => { const res = await fn(); if (!res.ok) setError(res.message); else router.refresh(); }); };
  const working = r.enabled && BUSY.has(r.status);
  return (
    <div className="space-y-2 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">PJe — {r.targetLabel}</p>
          <p className="text-xs text-muted">{r.documentHint}{r.hasOtp ? " · 2º fator cadastrado" : ""}{r.lastLogin ? ` · último acesso ${r.lastLogin}` : ""}</p>
        </div>
        {statusBadge(r)}
      </div>
      {r.statusMessage ? <p className="text-sm" role="status">{r.statusMessage}</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap items-start gap-2">
        <Button size="sm" variant="secondary" loading={pending} disabled={!r.enabled || working} onClick={() => act(() => testPortalAccessAction(r.id))}>Testar de novo</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setPortalAccessEnabledAction(r.id, !r.enabled))}>{r.enabled ? "Desligar" : "Ligar"}</Button>
        <ConfirmAction label="Remover" confirmLabel="Sim, remover" description="Apaga a senha guardada deste tribunal. Você pode cadastrar de novo quando quiser." action={() => deletePortalAccessAction(r.id)} onDone={() => router.refresh()} />
      </div>
      {r.technical ? (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Detalhes técnicos (para o suporte)</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-2">{r.technical}</pre>
        </details>
      ) : null}
    </div>
  );
}

export function PjeConnectCard({ targets, rows }: { targets: { key: string; label: string }[]; rows: PortalRowView[] }) {
  return (
    <Card>
      <CardHeader title="Conectar o PJe" description="Informe o seu login do PJe uma vez. O LegalOS entra por você, confere o acesso e mostra aqui o resultado." />
      <CardBody className="space-y-4">
        <PortalAccessList rows={rows} />
        <PjeConnectForm targets={targets} hasAccess={rows.length > 0} />
        <div className="rounded-xl border border-dashed border-border p-3 text-sm">
          <p className="font-medium">Entrar com certificado digital <Badge tone="warning">em validação</Badge></p>
          <p className="mt-1 text-xs text-muted">A maioria dos advogados entra no PJe com certificado. Estamos validando essa forma de entrada com um acesso real antes de liberar. Enquanto isso, se o seu login também funciona com CPF e senha, use o formulário acima.</p>
        </div>
      </CardBody>
    </Card>
  );
}
