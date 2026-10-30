import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { formatDateTime, relativeTime } from "@/lib/dates/format";
import type { ConnectionCard } from "@/server/judicial/connections.service";

function sourceTitle(connection: ConnectionCard) {
  if (connection.kind === "DJEN") return `Publicações do DJEN${connection.professional ? ` · ${connection.professional}` : ""}`;
  if (connection.kind === "PORTAL") return connection.title;
  return connection.title;
}

function sourceDetail(connection: ConnectionCard) {
  if (connection.kind === "DJEN") return "Monitoramento de publicações";
  if (connection.kind === "PORTAL") return "Acesso ao portal do tribunal";
  return connection.subtitle;
}

function lastSuccessLabel(connection: ConnectionCard) {
  if (connection.kind === "PORTAL") return "Último acesso registrado";
  if (connection.kind === "MNI") return "Última sincronização registrada";
  return "Última consulta registrada";
}

export function ConnectionList({ connections, timezone }: { connections: ConnectionCard[]; timezone: string }) {
  if (!connections.length) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium">Nenhuma fonte judicial cadastrada neste escritório.</p>
          <p className="mt-1 text-sm text-muted">O cadastro de uma conexão depende da escolha de um tribunal piloto, credenciais autorizadas e ambiente de homologação. Configurações antigas não ligam a automação do Box 3.0.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {connections.map((connection) => (
        <Card key={`${connection.kind}-${connection.id}`}>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-[15px] font-semibold">{sourceTitle(connection)}</h2>
                <p className="mt-1 text-xs text-muted">{sourceDetail(connection)}</p>
                <div className="mt-2"><Badge tone="neutral">Estado no cadastro histórico: {connection.stateLabel}</Badge></div>
              </div>
              <Badge tone="warning">Operação pausada</Badge>
            </div>

            <p className="text-sm leading-6">Cadastro preservado. O estado abaixo é histórico e não comprova funcionamento atual do Box 3.0.</p>

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">{lastSuccessLabel(connection)}</dt>
                <dd className="mt-1">{connection.lastSuccessAt ? `${relativeTime(connection.lastSuccessAt)} · ${formatDateTime(connection.lastSuccessAt, timezone)}` : "Nenhuma registrada"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Última captura registrada</dt>
                <dd className="mt-1">{connection.lastCaptureAt ? `${relativeTime(connection.lastCaptureAt)} · ${formatDateTime(connection.lastCaptureAt, timezone)}` : "Nenhuma registrada"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Cobertura no histórico</dt>
                <dd className="mt-1">{connection.coverageLabel ?? "Sem registro suficiente"}</dd>
              </div>
            </dl>

            <div className="border-t border-border pt-3">
              <h3 className="text-xs font-medium text-muted">Último estado registrado por operação</h3>
              {connection.capabilities.length ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {connection.capabilities.map((capability) => (
                    <li key={capability.op}>
                      <Badge tone="neutral">
                        {capability.label}: {capability.stateLabel.toLowerCase()} (histórico)
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">Ainda não há operações comprovadas.</p>
              )}
            </div>

          </CardBody>
        </Card>
      ))}
    </div>
  );
}
