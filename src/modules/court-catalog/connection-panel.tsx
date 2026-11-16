"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Plug, CheckCircle2, Clock, AlertTriangle, XCircle, Plus } from "lucide-react";
import { listAvailableTargetsAction, listConnectionsAction, listPortalCertificatesAction, type AvailableTarget, type ConnectionInfo } from "./connection-actions";
import { testConnectionAction, toggleConnectionAction, deleteConnectionAction } from "./connect-adapter-actions";
import { ConnectAdapterForm } from "./connect-form";
import { PortalCertificateUpload } from "./portal-certificate-upload";

function statusBadge(status: string | null, enabled: boolean) {
  if (!enabled) return <Badge tone="neutral">Desligado</Badge>;
  switch (status) {
    case "CONNECTED": return <Badge tone="success">Login validado</Badge>;
    case "PENDING":
    case "CONNECTING": return <Badge tone="info">Conectando…</Badge>;
    case "NEEDS_ACTION": return <Badge tone="warning">Ação necessária</Badge>;
    default: return <Badge tone="danger">Erro</Badge>;
  }
}

function statusIcon(status: string | null, enabled: boolean) {
  if (!enabled) return <XCircle className="h-4 w-4 text-muted" />;
  switch (status) {
    case "CONNECTED": return <CheckCircle2 className="h-4 w-4 text-success" />;
    case "PENDING":
    case "CONNECTING": return <Clock className="h-4 w-4 text-info" />;
    case "NEEDS_ACTION": return <AlertTriangle className="h-4 w-4 text-warning" />;
    default: return <XCircle className="h-4 w-4 text-danger" />;
  }
}

const BUSY = new Set(["PENDING", "CONNECTING"]);

function ConnectionRow({ target, conn, pilotEnabled, onUpdate }: { target: AvailableTarget; conn: ConnectionInfo; pilotEnabled: boolean; onUpdate: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const working = conn.enabled && BUSY.has(conn.status ?? "");
  const [terminalOpen, setTerminalOpen] = useState(working || conn.terminalEvents.length > 0);
  const terminalRef = useRef<HTMLPreElement>(null);
  const surface = target.adapterKey === "eproc-portal" ? "evolution-eproc" : "evolution";

  useEffect(() => {
    if ((working || terminalOpen) && terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [working, terminalOpen, conn.terminalEvents.length]);

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(undefined);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {statusIcon(conn.status, conn.enabled)}
          <div>
            <p className="text-sm font-medium">{target.courtCode} · {target.degreeLabel}</p>
            <p className="text-xs text-muted">{target.courtName} · {target.adapterLabel}</p>
          </div>
        </div>
        {statusBadge(conn.status, conn.enabled)}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {conn.statusMessage && <p className="max-w-3xl text-xs text-muted">{conn.statusMessage}</p>}
      <details
        open={working || terminalOpen}
        onToggle={(event) => setTerminalOpen(event.currentTarget.open)}
        className="overflow-hidden rounded-lg border border-slate-700 bg-[#0b1020] text-slate-100"
      >
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 font-mono text-xs">
          <span>Terminal do login · {target.courtCode}</span>
          <span className={working ? "text-emerald-300" : "text-slate-400"}>{working ? "AO VIVO" : `${conn.terminalEvents.length} evento(s)`}</span>
        </summary>
        <pre
          ref={terminalRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          className="max-h-64 overflow-auto border-t border-slate-700 px-3 py-2 font-mono text-[11px] leading-5"
        >
          {conn.terminalEvents.length ? conn.terminalEvents.map((event, index) => (
            <span key={`${event.at}-${index}`} className={`block ${event.level === "SUCCESS" ? "text-emerald-300" : event.level === "WARN" ? "text-amber-300" : event.level === "ERROR" ? "text-rose-300" : "text-slate-200"}`}>
              <span className="text-slate-500">[{new Date(event.at).toLocaleTimeString("pt-BR", { hour12: false })}]</span> {event.message}
            </span>
          )) : <span className="text-slate-400">Aguardando a primeira tentativa de login…</span>}
        </pre>
        <p className="border-t border-slate-700 px-3 py-1.5 text-[10px] text-slate-400">Senhas, códigos do autenticador e dados privados do certificado nunca são exibidos aqui.</p>
      </details>
      {conn.eprocReports?.map(({ label, rows, truncated }) => (
        <details key={label} className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{label} · {rows.length} registros lidos</summary>
          {truncated && <p className="mt-2 text-xs text-muted">Exibindo os primeiros 200 registros desta página.</p>}
          {rows.length > 0 && <div className="mt-2 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead><tr><th scope="col">Processo</th><th scope="col">Evento</th><th scope="col">Data e hora</th></tr></thead>
              <tbody>
                {rows.map((row, index) => <tr key={`${row.processNumber}-${index}`} className="border-t">
                  <td className="whitespace-nowrap px-2 py-1">{row.processNumber}</td>
                  <td className="px-2 py-1">{row.event ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1">{row.eventDate ?? "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </details>
      ))}
      <div className="flex flex-wrap items-start gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={onUpdate}>Atualizar certificado e autenticador</Button>
        {pilotEnabled && <>
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            disabled={!conn.enabled || working}
            onClick={() => act(() => testConnectionAction(conn.id!, surface))}
          >
            {target.targetKey === "tjmg-1g" && target.adapterKey === "eproc-portal" ? "Ler relatórios do eproc" : target.adapterKey === "eproc-portal" ? "Mapear listas do eproc" : "Testar de novo"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => act(() => toggleConnectionAction(conn.id!, !conn.enabled, surface))}
          >
            {conn.enabled ? "Desligar" : "Ligar"}
          </Button>
        </>}
        <ConfirmAction
          label="Remover"
          confirmLabel="Sim, remover"
          description="Apaga as credenciais guardadas. Você pode cadastrar de novo quando quiser."
          action={() => deleteConnectionAction(conn.id!, surface)}
          onDone={() => router.refresh()}
        />
      </div>
    </div>
  );
}

export function ConnectionPanel() {
  const [targets, setTargets] = useState<AvailableTarget[]>([]);
  const [pilotEnabled, setPilotEnabled] = useState(false);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [certificates, setCertificates] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<{ adapterKey: string; targetKey: string }>();

  const reload = () => {
    Promise.all([listAvailableTargetsAction(), listConnectionsAction(), listPortalCertificatesAction()])
      .then(([tRes, cRes, certRes]) => {
        if (tRes.ok && tRes.data) {
          setTargets(tRes.data.targets);
          setPilotEnabled(tRes.data.pilotEnabled);
        }
        if (cRes.ok && cRes.data) setConnections(cRes.data.connections);
        if (certRes.ok && certRes.data) setCertificates(certRes.data.certificates);
      })
      .catch(() => setError("Não foi possível carregar os dados de conexão."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    const busy = connections.some((c) => c.hasConnection && BUSY.has(c.status ?? ""));
    if (!busy) return;
    const t = setInterval(() => { reload(); }, 4000);
    return () => clearInterval(t);
  }, [connections]);

  if (loading) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted">Carregando adaptadores disponíveis…</p>
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">{error}</p>
        </CardBody>
      </Card>
    );
  }

  const getConnection = (targetKey: string, adapterKey: string) =>
    connections.find((c) => c.targetKey === targetKey && c.adapterKey === adapterKey);

  const connected = targets.filter((t) => {
    const conn = getConnection(t.targetKey, t.adapterKey);
    return conn?.hasConnection;
  });

  const available = targets.filter((t) => {
    const conn = getConnection(t.targetKey, t.adapterKey);
    return pilotEnabled && !conn?.hasConnection;
  });

  return (
    <div className="space-y-6">
      {certificates.length === 0 && <PortalCertificateUpload onDone={reload} />}
      {!pilotEnabled && (
        <Card>
          <CardBody>
            <p className="text-sm font-medium">Acesso privado desativado neste ambiente</p>
            <p className="mt-1 text-sm text-muted">Os testes de login dos tribunais só recebem dados quando a configuração explícita da Evolution estiver habilitada. O acesso não está homologado e não libera consulta de processos.</p>
          </CardBody>
        </Card>
      )}
      {connected.length > 0 && (
        <Card>
          <CardHeader
            title="Conexões do escritório"
            description={`${connected.length} acesso(s) cadastrado(s)`}
          />
          <CardBody className="divide-y divide-border">
            {connected.map((t) => {
              const conn = getConnection(t.targetKey, t.adapterKey)!;
              return (
                <ConnectionRow
                  key={`${t.targetKey}-${t.adapterKey}`}
                  target={t}
                  conn={conn}
                  pilotEnabled={pilotEnabled}
                  onUpdate={() => { setEditingTarget({ adapterKey: t.adapterKey, targetKey: t.targetKey }); setShowForm(true); }}
                />
              );
            })}
          </CardBody>
        </Card>
      )}

      {(showForm || editingTarget) && (
        <Card>
          <CardHeader title={editingTarget ? "Atualizar acesso ao tribunal" : "Conectar tribunal"} description="Selecione o certificado A1 e informe a chave obrigatória do autenticador." />
          <CardBody>
            <ConnectAdapterForm
              targets={editingTarget ? targets.filter((t) => t.adapterKey === editingTarget.adapterKey && t.targetKey === editingTarget.targetKey) : available}
              certificates={certificates}
              onDone={() => {
                setShowForm(false);
                setEditingTarget(undefined);
                reload();
              }}
            />
          </CardBody>
        </Card>
      )}

      {available.length > 0 && (
        <Card>
          <CardHeader
            title="Tribunais disponíveis"
            description="Acessos dos tribunais listados por certificado digital A1 e chave do autenticador obrigatória."
          />
          <CardBody className="space-y-4">
            {!showForm && (
              <div className="divide-y divide-border">
                {available.map((t) => (
                  <div key={`${t.targetKey}-${t.adapterKey}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <Plug className="h-4 w-4 text-muted" />
                      <div>
                        <p className="text-sm font-medium">{t.courtCode} · {t.degreeLabel}</p>
                        <p className="text-xs text-muted">{t.courtName} · {t.engineLabel ?? t.adapterLabel}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted">{t.authModes.map((m) => m.label).join(", ")}</span>
                  </div>
                ))}
              </div>
            )}
            {!showForm && !editingTarget && (
              <Button
                variant="secondary"
                onClick={() => setShowForm(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Conectar tribunal
              </Button>
            )}
          </CardBody>
        </Card>
      )}

      {targets.length === 0 && (
        <Card>
          <CardBody>
            <div className="text-center py-4">
              <Plug className="mx-auto h-8 w-8 text-muted" />
              <p className="mt-2 text-sm text-muted">Nenhum adaptador de tribunal está pronto ainda. Os adaptadores são habilitados um por vez, conforme validação real.</p>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted space-y-1">
        <p>Uma conexão validada confirma apenas o acesso ao portal; consulta de processos e leitura de publicações dependem de integração adicional.</p>
        <p>O LegalOS cifra os dados do certificado e do autenticador no cofre. A3 em token/cartão físico não pode ser usado pelo navegador remoto.</p>
      </div>
    </div>
  );
}
