"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Plug, CheckCircle2, Clock, AlertTriangle, XCircle, Plus } from "lucide-react";
import { listAvailableTargetsAction, listConnectionsAction, type AvailableTarget, type ConnectionInfo } from "./connection-actions";
import { testConnectionAction, toggleConnectionAction, deleteConnectionAction } from "./connect-adapter-actions";
import { ConnectAdapterForm } from "./connect-form";

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

function ConnectionRow({ target, conn, pilotEnabled }: { target: AvailableTarget; conn: ConnectionInfo; pilotEnabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const working = conn.enabled && BUSY.has(conn.status ?? "");
  const surface = target.adapterKey === "eproc-portal" ? "evolution-eproc" : "evolution";

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
      <div className="flex flex-wrap items-start gap-2">
        {pilotEnabled && <>
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            disabled={!conn.enabled || working}
            onClick={() => act(() => testConnectionAction(conn.id!, surface))}
          >
            Testar de novo
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [showForm, setShowForm] = useState(false);

  const reload = () => {
    Promise.all([listAvailableTargetsAction(), listConnectionsAction()])
      .then(([tRes, cRes]) => {
        if (tRes.ok && tRes.data) {
          setTargets(tRes.data.targets);
          setPilotEnabled(tRes.data.pilotEnabled);
        }
        if (cRes.ok && cRes.data) setConnections(cRes.data.connections);
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

  const getConnection = (courtCode: string, degree: string, adapterKey: string) =>
    connections.find((c) => c.courtCode === courtCode && c.degree === degree && c.adapterKey === adapterKey);

  const connected = targets.filter((t) => {
    const conn = getConnection(t.courtCode, t.degree, t.adapterKey);
    return conn?.hasConnection;
  });

  const available = targets.filter((t) => {
    const conn = getConnection(t.courtCode, t.degree, t.adapterKey);
    return pilotEnabled && !conn?.hasConnection;
  });

  return (
    <div className="space-y-6">
      {!pilotEnabled && (
        <Card>
          <CardBody>
            <p className="text-sm font-medium">Acesso privado desativado neste ambiente</p>
            <p className="mt-1 text-sm text-muted">Os logins TJMG · PJe legado e eproc só recebem credenciais quando a configuração explícita da Evolution estiver habilitada. O acesso não está homologado e não libera consulta de processos.</p>
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
              const conn = getConnection(t.courtCode, t.degree, t.adapterKey)!;
              return (
                <ConnectionRow
                  key={`${t.courtCode}-${t.degree}`}
                  target={t}
                  conn={conn}
                  pilotEnabled={pilotEnabled}
                />
              );
            })}
          </CardBody>
        </Card>
      )}

      {available.length > 0 && (
        <Card>
          <CardHeader
            title="Tribunais disponíveis"
            description="Destino TJMG · PJe legado disponível para teste de login. O acesso ainda não foi homologado e não ativa consulta de processos."
          />
          <CardBody className="space-y-4">
            {!showForm && (
              <div className="divide-y divide-border">
                {available.map((t) => (
                  <div key={`${t.courtCode}-${t.degree}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
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
            {showForm ? (
              <ConnectAdapterForm
                targets={available}
                onDone={() => {
                  setShowForm(false);
                  reload();
                }}
              />
            ) : (
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
        <p>O LegalOS conecta-se a tribunais por adaptadores específicos de cada motor (PJe, eproc, e-SAJ, PROJUDI). Cada adaptador é validado com acesso real antes de ser liberado.</p>
        <p>Credenciais são cifradas no cofre do escritório. O LegalOS não repete senha errada, não resolve captcha e para quando o portal pede ação humana.</p>
      </div>
    </div>
  );
}
