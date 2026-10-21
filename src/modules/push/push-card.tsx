"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { saveOrgPushAction, savePushPrefsAction, sendPushTestAction, subscribePushAction, unsubscribePushAction } from "./actions";

export type PushView = {
  configured: boolean;
  publicKey: string | null;
  orgEnabled: boolean;
  canManageOrg: boolean;
  prefs: { deadlines: boolean; tasks: boolean; announcements: boolean; leadDays: number };
  devices: { id: string; endpoint: string; userAgent: string | null; createdAt: string; lastSentAt: string | null }[];
};
type Msg = { tone: "error" | "success" | "info"; text: string } | null;
type Support = "checking" | "ok" | "no-sw" | "ios-install" | "denied";

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const errText = (r: { message?: string; fieldErrors?: Record<string, string[] | undefined> }) => (r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "") || r.message || "Não foi possível concluir.";

export function PushCard({ view }: { view: PushView }) {
  const router = useRouter();
  const [support, setSupport] = React.useState<Support>("checking");
  const [thisEndpoint, setThisEndpoint] = React.useState<string | null>(null);
  const [prefs, setPrefs] = React.useState(view.prefs);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();

  const refreshLocal = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupport(ios && !standalone ? "ios-install" : "no-sw");
      return;
    }
    if (Notification.permission === "denied") { setSupport("denied"); return; }
    setSupport("ok");
    try {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setThisEndpoint(sub?.endpoint ?? null);
    } catch { setThisEndpoint(null); }
  }, []);
  // Lê o estado do navegador (permissão e inscrição) depois de montar; não existe no servidor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { void refreshLocal(); }, [refreshLocal, view.devices.length]);

  const registered = !!thisEndpoint && view.devices.some((d) => d.endpoint === thisEndpoint);

  const enable = () => start(async () => {
    setMsg(null);
    try {
      if (!view.publicKey) { setMsg({ tone: "error", text: "O servidor ainda não tem as chaves de aviso (veja docs/push.md)." }); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMsg({ tone: "error", text: "O aparelho não permitiu avisos. Libere nas configurações do navegador para este site." }); await refreshLocal(); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(view.publicKey) }));
      const r = await subscribePushAction(sub.toJSON());
      if (!r.ok) { setMsg({ tone: "error", text: errText(r) }); return; }
      setThisEndpoint(sub.endpoint);
      setMsg({ tone: "success", text: "Aviso ativado neste aparelho. Use o botão de teste para conferir." });
    } catch {
      setMsg({ tone: "error", text: "Não foi possível ativar neste aparelho. No iPhone, instale o app na tela inicial primeiro." });
    }
    router.refresh();
  });

  const disable = () => start(async () => {
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await unsubscribePushAction(sub.endpoint); await sub.unsubscribe(); }
      setThisEndpoint(null);
      setMsg({ tone: "success", text: "Aviso desativado neste aparelho." });
    } catch { setMsg({ tone: "error", text: "Não foi possível desativar agora." }); }
    router.refresh();
  });

  const test = () => start(async () => {
    const r = await sendPushTestAction();
    setMsg(r.ok ? (r.data && r.data.sent > 0 ? { tone: "success", text: `Teste enviado a ${r.data.sent} aparelho(s). Olhe a tela do celular.` } : { tone: "error", text: "O serviço de avisos recusou o envio. Desative e ative de novo." }) : { tone: "error", text: errText(r) });
    router.refresh();
  });

  const savePrefs = () => start(async () => {
    const r = await savePushPrefsAction(prefs);
    setMsg(r.ok ? { tone: "success", text: "Preferências salvas." } : { tone: "error", text: errText(r) });
    router.refresh();
  });

  const toggleOrg = (enabled: boolean) => start(async () => {
    const r = await saveOrgPushAction({ enabled });
    setMsg(r.ok ? { tone: "success", text: enabled ? "Avisos no celular ligados para o escritório." : "Avisos no celular desligados para o escritório." } : { tone: "error", text: errText(r) });
    router.refresh();
  });

  return (
    <div className="space-y-4" data-testid="push-card">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Alert tone="info">Você recebe um aviso no celular quando prazos ou tarefas seus estiverem perto de vencer. O aviso é genérico (só a quantidade): <strong>nunca mostra nome de cliente nem número de processo</strong>. Só chega entre 7h e 20h.</Alert>
      {!view.configured ? <div data-testid="push-not-configured"><Alert tone="warning">O servidor ainda não está com as chaves de aviso configuradas. Peça à equipe de TI para seguir o passo a passo em docs/push.md.</Alert></div> : null}
      {support === "ios-install" ? <div data-testid="push-ios"><Alert tone="warning">No iPhone, o aviso só funciona com o app instalado: abra este site no Safari, toque em Compartilhar e em <strong>Adicionar à Tela de Início</strong>. Depois abra o app pelo ícone e volte aqui. Precisa do iOS 16.4 ou mais novo.</Alert></div> : null}
      {support === "no-sw" ? <Alert tone="warning">Este navegador não suporta avisos no celular. No Android use o Chrome.</Alert> : null}
      {support === "denied" ? <Alert tone="warning">Os avisos estão bloqueados para este site no navegador. Libere nas configurações do navegador e volte aqui.</Alert> : null}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">Este aparelho:</span>
        <Badge tone={registered ? "success" : "neutral"} data-testid="push-device-status">{registered ? "Ativado" : "Desativado"}</Badge>
        {registered
          ? <><Button size="sm" variant="secondary" loading={pending} onClick={disable}>Desativar</Button><Button size="sm" loading={pending} onClick={test} data-testid="push-test">Enviar notificação de teste</Button></>
          : <Button size="sm" loading={pending} onClick={enable} disabled={support !== "ok" || !view.configured} data-testid="push-enable">Ativar neste aparelho</Button>}
      </div>
      {!view.orgEnabled ? <p className="text-xs text-muted" data-testid="push-org-off">Os avisos automáticos de vencimento estão desligados para o escritório (o teste funciona mesmo assim).</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Avisar quando faltarem até" htmlFor="push-lead">
          <Select id="push-lead" value={String(prefs.leadDays)} onChange={(e) => setPrefs({ ...prefs, leadDays: Number(e.target.value) })}>
            <option value="0">Só no dia do vencimento</option>
            <option value="1">1 dia</option>
            <option value="2">2 dias</option>
            <option value="3">3 dias</option>
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.deadlines} onChange={(e) => setPrefs({ ...prefs, deadlines: e.target.checked })} /> Avisar sobre prazos</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.tasks} onChange={(e) => setPrefs({ ...prefs, tasks: e.target.checked })} /> Avisar sobre tarefas</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.announcements} onChange={(e) => setPrefs({ ...prefs, announcements: e.target.checked })} /> Receber comunicados da plataforma (novidades e manutenção)</label>
      <Button loading={pending} onClick={savePrefs}>Salvar preferências</Button>

      {view.devices.length ? (
        <div className="space-y-1 text-sm">
          <div className="text-xs font-medium">Aparelhos ativados</div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {view.devices.map((d) => <li key={d.id} className="flex justify-between gap-2 p-2"><span className="truncate">{(d.userAgent ?? "Aparelho").slice(0, 60)}</span><span className="shrink-0 text-xs text-muted">{fmt(d.createdAt)}</span></li>)}
          </ul>
        </div>
      ) : null}

      {view.canManageOrg ? (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm" data-testid="push-org-panel">
          <div className="font-medium">Escritório (administração)</div>
          <div className="flex flex-wrap items-center gap-3">
            <span>Avisos automáticos de vencimento:</span>
            <Badge tone={view.orgEnabled ? "success" : "neutral"} data-testid="push-org-status">{view.orgEnabled ? "Ligado" : "Desligado"}</Badge>
            {view.orgEnabled ? <Button size="sm" variant="secondary" loading={pending} onClick={() => toggleOrg(false)}>Desligar</Button> : <Button size="sm" loading={pending} onClick={() => toggleOrg(true)} disabled={!view.configured}>Ligar</Button>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
