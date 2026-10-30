import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateTime } from "@/lib/dates/format";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { COURT_SYSTEMS } from "@/lib/court-systems";
import { listTribunals } from "@/lib/mni/tribunals";
import { requireTenant } from "@/server/session";
import { getBoxV3SettingsSnapshot } from "@/server/judicial/box-v3-settings.service";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";
import { CredentialActions, CredentialForm } from "@/modules/court-credentials/credential-ui";
import { BoxV3UploadCertificateForm, RevokeBoxV3CertificateButton } from "@/modules/box-v3/settings-forms";
import { listUsableCertificates, vaultAvailable } from "@/server/services/certificate.service";
import { listActiveMembers } from "@/server/services/members";
import { db } from "@/lib/db/client";
import { AuthorizedUsers } from "@/modules/certificates/certificate-ui";

export const metadata: Metadata = { title: "Certificados e acessos · LegalOS Box 3.0" };
const certificateState: Record<string, string> = { ACTIVE: "Vigente", EXPIRING: "Vence em até 30 dias", EXPIRED: "Vencido", REVOKED: "Revogado" };
const credentialState: Record<string, string> = { PRONTA: "Checklist completo", PENDENTE: "Pendente", SEM_CONECTOR: "Sem conector compatível" };
const authMode: Record<string, string> = { PASSWORD: "Usuário e senha", CERTIFICATE: "Certificado digital", PASSWORD_AND_CERTIFICATE: "Senha e certificado" };

export default async function BoxV3SettingsPage() {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  const [snapshot, mfa, members, usableCertificates] = await Promise.all([
    getBoxV3SettingsSnapshot(ctx),
    db.userMfa.findUnique({ where: { userId: ctx.userId }, select: { enabledAt: true } }),
    ctx.permissions.has("certificates:manage") ? listActiveMembers(ctx) : Promise.resolve([]),
    vaultAvailable() && ctx.permissions.has("cases:read") ? listUsableCertificates(ctx, "v3") : Promise.resolve([]),
  ]);
  const vault = vaultAvailable();
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Certificados e acessos" description="Inventário protegido das configurações já cadastradas neste escritório." />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3/configuracoes" />
      <Alert tone="warning">Você pode gerenciar cadastros protegidos do escritório. Isso não valida acesso no tribunal nem confirma o uso do PJeOffice; consultas, sincronizações e protocolos continuam pausados.</Alert>
      {!mfa?.enabledAt && (ctx.permissions.has("certificates:manage") || ctx.permissions.has("integrations:manage") || ctx.permissions.has("cases:read")) ? <Alert tone="warning">Ative a verificação em duas etapas da sua conta antes de guardar ou remover credenciais ou administrar certificados.</Alert> : null}
      {snapshot.canReadCertificates ? <Card>
        <CardHeader title="Certificados cadastrados" description="O inventário não abre nem devolve o arquivo, a senha ou a impressão digital do certificado." />
        <CardBody className="space-y-3">
          {!snapshot.certificates.length ? <p className="text-sm text-muted">Nenhum certificado cadastrado.</p> : snapshot.certificates.map((certificate) => <article key={certificate.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{certificate.label}</h2><Badge tone={certificate.state === "ACTIVE" ? "success" : certificate.state === "EXPIRING" ? "warning" : "danger"}>{certificateState[certificate.state]}</Badge></div>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted">Responsável</dt><dd className="mt-1">{certificate.owner}</dd></div><div><dt className="text-xs text-muted">Validade registrada</dt><dd className="mt-1">{formatDateTime(certificate.expiresAt, ctx.timezone)}</dd></div><div><dt className="text-xs text-muted">Uso nesta prévia</dt><dd className="mt-1">{certificate.consultationOnly ? "Somente consulta; nenhuma operação judicial é acionada" : certificate.signingEnabledAt ? `Cadastro antigo liberou assinatura em ${formatDateTime(certificate.signingEnabledAt, ctx.timezone)}, mas a prévia V3 não assina nem protocola` : "Assinatura não liberada; envio segue indisponível na V3"}</dd></div></dl>
            {certificate.state !== "REVOKED" && ctx.permissions.has("certificates:manage") ? <AuthorizedUsers certificateId={certificate.id} authorized={certificate.authorizedUsers} candidates={members.filter((member) => member.id !== certificate.ownerUserId).map((member) => ({ id: member.id, name: member.name }))} surface="v3" /> : null}
            {certificate.state !== "REVOKED" && ctx.permissions.has("certificates:manage") ? <div className="mt-3"><RevokeBoxV3CertificateButton id={certificate.id} /></div> : null}
          </article>)}
        </CardBody>
      </Card> : null}
      {snapshot.canReadCertificates && ctx.permissions.has("certificates:manage") ? <Card>
        <CardHeader title="Guardar certificado A1" description="Cadastro protegido por verificação em duas etapas; certificados novos ficam somente para consulta." />
        <CardBody>{!vault ? <Alert tone="warning">O cofre ainda não está configurado neste sistema; nada será armazenado até a chave de criptografia ser configurada.</Alert> : !mfa?.enabledAt ? <Alert tone="warning">Ative a verificação em duas etapas da sua conta para guardar ou revogar certificados.</Alert> : <BoxV3UploadCertificateForm members={members.map((member) => ({ id: member.id, name: member.name }))} />}</CardBody>
      </Card> : null}
      {(snapshot.canReadAllCredentials || ctx.permissions.has("cases:read")) ? <Card>
        <CardHeader title={snapshot.canReadAllCredentials ? "Credenciais cadastradas no escritório" : "Suas credenciais cadastradas"} description="Cada integrante guarda seus próprios dados. O cadastro não testa nem liga a conexão judicial." />
        <CardBody className="space-y-3">
          {ctx.permissions.has("cases:read") && vault ? <><Alert tone="info">Sua credencial fica cifrada e só é aberta por um conector autorizado. A tela não envia esses dados ao tribunal.</Alert>{!mfa?.enabledAt ? <Alert tone="warning">Ative a verificação em duas etapas da sua conta antes de guardar ou remover credenciais.</Alert> : <CredentialForm surface="v3" systems={COURT_SYSTEMS} tribunals={listTribunals().map((tribunal) => ({ jtr: tribunal.jtr, label: tribunal.label }))} certificates={usableCertificates} />}</> : null}
          {!snapshot.credentials.length ? <p className="text-sm text-muted">Nenhuma credencial cadastrada.</p> : <div className="divide-y divide-border">{snapshot.credentials.map((credential) => <div key={credential.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium">{credential.system} · {credential.courtCode}</p><p className="mt-1 text-xs text-muted">{credential.owner} · {authMode[credential.authMode] ?? "Método cadastrado"}{credential.checkedAt ? ` · checklist conferido em ${formatDateTime(credential.checkedAt, ctx.timezone)}` : " · checklist ainda não conferido"}</p></div><div className="flex items-center gap-2"><Badge tone={credential.checkStatus === "PRONTA" ? "success" : credential.checkStatus === "PENDENTE" ? "warning" : "neutral"}>{credentialState[credential.checkStatus ?? ""] ?? "Sem verificação"}</Badge><CredentialActions id={credential.id} mine={credential.mine} surface="v3" /></div></div>)}</div>}
        </CardBody>
      </Card> : null}
    </div>
  );
}
