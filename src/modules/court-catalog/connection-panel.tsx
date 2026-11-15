"use client";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Plug, CheckCircle2, Clock, AlertTriangle, XCircle, Shield } from "lucide-react";
import { listAvailableTargetsAction, listConnectionsAction, type AvailableTarget, type ConnectionInfo } from "./connection-actions";

function statusBadge(status: string | null, enabled: boolean) {
  if (!enabled) return <Badge tone="neutral">Desligado</Badge>;
  switch (status) {
    case "CONNECTED": return <Badge tone="success">Conectado</Badge>;
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

export function ConnectionPanel() {
  const [targets, setTargets] = useState<AvailableTarget[]>([]);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([listAvailableTargetsAction(), listConnectionsAction()])
      .then(([tRes, cRes]) => {
        if (tRes.ok && tRes.data) setTargets(tRes.data.targets);
        if (cRes.ok && cRes.data) setConnections(cRes.data.connections);
      })
      .catch(() => setError("Não foi possível carregar os dados de conexão."))
      .finally(() => setLoading(false));
  }, []);

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

  const getConnection = (courtCode: string, degree: string) =>
    connections.find((c) => c.courtCode === courtCode && c.degree === degree);

  const connected = targets.filter((t) => {
    const conn = getConnection(t.courtCode, t.degree);
    return conn?.hasConnection;
  });

  const available = targets.filter((t) => {
    const conn = getConnection(t.courtCode, t.degree);
    return !conn?.hasConnection;
  });

  return (
    <div className="space-y-6">
      {/* Conexões ativas */}
      {connected.length > 0 && (
        <Card>
          <CardHeader
            title="Conexões do escritório"
            description={`${connected.length} tribunal(is) com conexão cadastrada`}
          />
          <CardBody className="divide-y divide-border">
            {connected.map((t) => {
              const conn = getConnection(t.courtCode, t.degree)!;
              return (
                <div key={`${t.courtCode}-${t.degree}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    {statusIcon(conn.status, conn.enabled)}
                    <div>
                      <p className="text-sm font-medium">{t.courtCode} · {t.degreeLabel}</p>
                      <p className="text-xs text-muted">{t.courtName} · {t.adapterLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(conn.status, conn.enabled)}
                    <a href="/integracoes" className="text-xs text-primary-text hover:underline">Gerenciar</a>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}

      {/* Tribunais disponíveis para conexão */}
      {available.length > 0 && (
        <Card>
          <CardHeader
            title="Tribunais com adaptador pronto"
            description="Estes tribunais já têm adaptador implementado. Para conectar, acesse a página de integrações."
          />
          <CardBody className="divide-y divide-border">
            {available.map((t) => (
              <div key={`${t.courtCode}-${t.degree}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <Plug className="h-4 w-4 text-muted" />
                  <div>
                    <p className="text-sm font-medium">{t.courtCode} · {t.degreeLabel}</p>
                    <p className="text-xs text-muted">{t.courtName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">{t.authModes.map((m) => m.label).join(", ")}</span>
                  <a href="/integracoes" className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-2">
                    <Shield className="h-3 w-3" />
                    Conectar
                  </a>
                </div>
              </div>
            ))}
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
