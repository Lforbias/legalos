import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { COURT_SYSTEMS } from "@/lib/court-systems";
import { listTribunals } from "@/lib/mni/tribunals";
import { CredentialActions, CredentialForm } from "@/modules/court-credentials/credential-ui";
import { can } from "@/server/context";
import { listUsableCertificates, vaultAvailable } from "@/server/services/certificate.service";
import { listMyCredentials, listOrgCredentials, type CredentialRow } from "@/server/services/court-credential.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Credenciais dos tribunais" };

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  PRONTA: { label: "Completa", tone: "success" },
  PENDENTE: { label: "Pendente", tone: "warning" },
  SEM_CONECTOR: { label: "Sem conector ainda", tone: "neutral" },
};

function List({ rows, tz, showUser }: { rows: CredentialRow[]; tz: string; showUser: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted">Nenhuma credencial.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 space-y-0.5 text-sm">
            <p className="font-medium">
              {c.systemLabel} · {c.courtCode || "todos os tribunais"} {c.checkStatus ? <Badge tone={STATUS[c.checkStatus]?.tone ?? "neutral"}>{STATUS[c.checkStatus]?.label ?? c.checkStatus}</Badge> : null}
            </p>
            <p className="text-xs text-muted">
              {showUser ? `${c.userName} · ` : ""}
              {c.documentHint}
            </p>
            {c.checkMessage ? <p className="text-xs text-muted">{c.checkMessage}{c.checkedAt ? ` (${formatDateTime(c.checkedAt, tz)})` : ""}</p> : null}
          </div>
          <CredentialActions id={c.id} mine={c.mine} />
        </li>
      ))}
    </ul>
  );
}

export default async function CourtCredentialsPage() {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const available = vaultAvailable();
  const [mine, others, certs] = await Promise.all([
    available ? listMyCredentials(ctx) : Promise.resolve([]),
    available && can(ctx, "integrations:manage") ? listOrgCredentials(ctx).then((r) => r.filter((x) => !x.mine)) : Promise.resolve([]),
    available ? listUsableCertificates(ctx) : Promise.resolve([]),
  ]);
  const tz = organization.timezone;
  return (
    <div className="space-y-4">
      <Alert tone="info">Cada pessoa guarda o próprio acesso a cada sistema de tribunal. O segredo fica cifrado, nunca volta para a tela e só é usado quando você mesmo consulta ou protocola. Sem credencial pessoal, vale a conexão do escritório.</Alert>
      {!available ? <Alert tone="warning">O cofre ainda não foi habilitado neste sistema (falta CERT_ENCRYPTION_KEY). Nada é guardado sem ele.</Alert> : null}
      {available ? (
        <Card>
          <CardHeader title="Guardar credencial" description="Salvar de novo para o mesmo sistema e tribunal substitui a anterior. Exige verificação em duas etapas." />
          <CardBody>
            <CredentialForm systems={COURT_SYSTEMS} tribunals={listTribunals().map((t) => ({ jtr: t.jtr, label: t.label }))} certificates={certs} />
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Minhas credenciais" />
        <CardBody><List rows={mine} tz={tz} showUser={false} /></CardBody>
      </Card>
      {others.length ? (
        <Card>
          <CardHeader title="Credenciais da equipe" description="Só quem administra integrações vê. O segredo nunca aparece; você pode remover a de quem saiu." />
          <CardBody><List rows={others} tz={tz} showUser /></CardBody>
        </Card>
      ) : null}
    </div>
  );
}
