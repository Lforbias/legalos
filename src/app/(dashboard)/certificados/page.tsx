import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/dates/format";
import { AuthorizedUsers, RevokeCertificateButton, UploadCertificateForm } from "@/modules/certificates/certificate-ui";
import { can } from "@/server/context";
import { listAuthorizedUsers, listCertificates, runCertificateExpiryCheck, vaultAvailable, type CertStatus } from "@/server/services/certificate.service";
import { listActiveMembers } from "@/server/services/members";
import { db } from "@/lib/db/client";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Certificados digitais" };

const STATUS: Record<CertStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Válido", tone: "success" },
  EXPIRING: { label: "Vence em breve", tone: "warning" },
  EXPIRED: { label: "Vencido", tone: "danger" },
  REVOKED: { label: "Revogado", tone: "neutral" },
};

export default async function CertificatesPage() {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "certificates:manage")) return <AccessDenied />;
  const available = vaultAvailable();
  const mfa = await db.userMfa.findUnique({ where: { userId: ctx.userId }, select: { enabledAt: true } });
  await runCertificateExpiryCheck(ctx.organizationId).catch(() => 0);
  const [certs, members] = await Promise.all([available ? listCertificates(ctx) : Promise.resolve([]), listActiveMembers(ctx)]);
  const authorizedById = new Map(await Promise.all(certs.map(async (c) => [c.id, c.revokedAt ? [] : await listAuthorizedUsers(ctx, c.id)] as const)));
  const tz = organization.timezone;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Certificados digitais" description="Cofre de certificados A1 dos advogados, novos cadastros protegidos pelo modo somente consulta." />
      <div className="space-y-4">
        <Alert tone="info">O arquivo e a senha ficam cifrados (AES-256-GCM), nunca aparecem na tela nem voltam por nenhuma rota, e cada uso é registrado. Certificados A3 (token/cartão) não funcionam em servidor.</Alert>
        {!available ? <Alert tone="warning">O cofre ainda não foi habilitado neste sistema: falta a chave de cifra (variável CERT_ENCRYPTION_KEY). Nada é guardado sem ela.</Alert> : null}
        {available && !mfa?.enabledAt ? <Alert tone="warning">Para guardar ou revogar certificados, ative a verificação em duas etapas em Minha conta.</Alert> : null}
        {available ? (
          <Card>
            <CardHeader title="Guardar novo certificado" />
            <CardBody>
              <UploadCertificateForm members={members.map((m) => ({ id: m.id, name: m.name }))} />
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Certificados do escritório" />
          <CardBody>
            {certs.length === 0 ? <p className="text-sm text-muted">Nenhum certificado guardado.</p> : null}
            <ul className="divide-y divide-border">
              {certs.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">
                      {c.label} <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge> <Badge tone={c.consultationOnly ? "info" : "warning"}>{c.consultationOnly ? "Somente consulta" : "Certificado anterior — sem trava de consulta"}</Badge>
                    </p>
                    <p className="text-xs text-muted">
                      Titular: {c.ownerName} · {c.subjectCn}
                      {c.documentHint ? ` · ${c.documentHint}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      Válido até {formatDate(c.notAfter, tz)} · {c.lastUsedAt ? `último uso ${formatDateTime(c.lastUsedAt, tz)}` : "ainda não usado"}
                    </p>
                    {!c.revokedAt ? <AuthorizedUsers certificateId={c.id} authorized={authorizedById.get(c.id) ?? []} candidates={members.filter((m) => m.id !== c.ownerUserId).map((m) => ({ id: m.id, name: m.name }))} /> : null}
                  </div>
                  {!c.revokedAt ? <RevokeCertificateButton id={c.id} /> : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
