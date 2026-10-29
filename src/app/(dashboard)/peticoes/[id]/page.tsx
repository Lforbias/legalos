import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { canSubmitAgain, FILING_ENV_LABEL, petitionStateInfo, type AttemptOutcome, type FilingEnvironment } from "@/lib/judicial/petition-state";
import { getPetitioningAdapter } from "@/lib/petitioning/adapter";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { PetitionAttachments } from "@/modules/petitions/petition-attachments";
import { PetitionControls } from "@/modules/petitions/petition-controls";
import { ReconcilePanel } from "@/modules/petitions/reconcile-panel";
import { ScheduleCard } from "@/modules/petitions/schedule-card";
import { getScheduleSwitch } from "@/server/services/petition-queue.service";
import type { AttachmentClassKey, PetitionStatusKey } from "@/modules/petitions/schemas";
import { db } from "@/lib/db/client";
import { can } from "@/server/context";
import { listDocuments } from "@/server/services/document.service";
import { getPetition } from "@/server/services/petition.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Petição" };

const ATTEMPT_LABEL: Record<string, string> = { STARTED: "Em andamento", CONFIRMED: "Confirmada", REJECTED: "Recusada pelo tribunal", UNCERTAIN: "Sem confirmação", ABORTED: "Encerrada" };

export default async function PetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "petitions:read")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getPetition(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!data) notFound();
  const { petition: p, names, stale, attachments, attempts, officialReceipt } = data;
  const tz = organization.timezone;
  const status = p.status as PetitionStatusKey;
  const canWrite = can(ctx, "petitions:write");
  const editableAtt = status === "DRAFT" && canWrite && can(ctx, "documents:read");
  const used = new Set([p.documentId, ...attachments.map((a) => a.documentId)]);
  const options = editableAtt ? (await listDocuments(ctx, { caseId: p.caseId })).filter((d) => !used.has(d.id)).map((d) => ({ id: d.id, name: d.name })) : [];
  const anyStale = attachments.some((a) => a.stale);
  const info = petitionStateInfo(status, p.filingEnvironment, p.isDemo);
  const lastAttempt = (attempts[0]?.outcome ?? null) as AttemptOutcome | null;
  const again = canSubmitAgain({ status, lastAttempt, error: p.error });
  const canResend = again.ok;
  const doubt = info.needsReconciliation || (status === "FAILED" && !again.ok);
  const canReconcile = can(ctx, "petitions:approve") && can(ctx, "documents:read");
  // Quem pode registrar o resultado vê o painel de conferência quando há dúvida, ou para registrar um protocolo feito por fora.
  const showReconcile = canReconcile && (doubt || status === "APPROVED" || (status === "FAILED" && again.ok));
  const caseDocs = showReconcile ? (await listDocuments(ctx, { caseId: p.caseId })).map((d) => ({ id: d.id, name: d.name })) : [];
  const adapterIsDemo = getPetitioningAdapter().isDemo;
  const receiptDoc = officialReceipt?.receiptDocumentId ? await db.document.findFirst({ where: { id: officialReceipt.receiptDocumentId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true } }) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={p.title}
        description={p.kind ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={info.tone}>{info.label}</Badge>
            {status === "DRAFT" && canWrite ? (
              <Link href={`/peticoes/${p.id}/editar`} className={bv({ variant: "secondary" })}>
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </Link>
            ) : null}
          </div>
        }
      />
      {info.testOnly || (adapterIsDemo && status !== "FILED_CONFIRMED") ? (
        <Alert tone="warning" className="mb-4" data-testid="petition-test-banner">
          {info.testOnly ? `${info.explanation} ` : "Adaptador de demonstração: nenhum protocolo real foi ou será feito por esta tela. "}
          Para protocolar de fato, use uma conexão homologada ou o sistema do tribunal com o arquivo da versão aprovada, e registre aqui o recibo.
        </Alert>
      ) : null}
      {!adapterIsDemo && status !== "FILED_CONFIRMED" ? (
        <Alert tone="warning" className="mb-4">
          Protocolo REAL pelo PJe/MNI: o envio é irreversível e vai ao tribunal. Esta integração só protocola depois de uma verificação recente e bem-sucedida em tribunal de verdade; confira sempre o recibo no sistema do tribunal.
        </Alert>
      ) : null}
      {info.needsReconciliation ? (
        <Alert tone={status === "UNKNOWN" ? "error" : "warning"} className="mb-4" data-testid="petition-doubt-banner">
          {info.explanation}
        </Alert>
      ) : null}
      {status === "FAILED" && !again.ok ? <Alert tone="error" className="mb-4" data-testid="petition-doubt-banner">{again.reason}</Alert> : null}
      {p.reviewNote && status === "DRAFT" ? <Alert tone="info" className="mb-4">Devolvida para ajustes: {p.reviewNote}</Alert> : null}
      {p.error && status === "FAILED" ? <Alert tone="error" className="mb-4">{p.error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Dados" />
          <CardBody className="space-y-2 text-sm">
            <p><span className="text-muted">Processo:</span> <Link href={`/processos/${p.case.id}`} className="text-primary-text hover:underline">{p.case.title}</Link>{p.case.number ? ` — ${p.case.number}` : ""}</p>
            <p><span className="text-muted">Juízo / tribunal:</span> {p.court ?? "—"}</p>
            <p>
              <span className="text-muted">Documento:</span>{" "}
              <Link href={`/documentos/${p.document.id}`} className="text-primary-text hover:underline">{p.document.name}</Link>{" "}
              <Badge>v{p.documentVersion}</Badge>{stale ? <Badge tone="warning" className="ml-1">há versão mais nova (v{p.document.currentVersion})</Badge> : null}
            </p>
            <p><a className="text-primary-text hover:underline" href={`/api/documents/${p.document.id}?v=${p.documentVersion}`}>Baixar a versão {p.documentVersion}</a></p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Andamento" />
          <CardBody className="space-y-1.5 text-sm">
            <p><span className="text-muted">Preparada por:</span> {p.authorId ? (names.get(p.authorId) ?? "ex-membro") : "—"} em {formatDateTime(p.createdAt, tz)}</p>
            {p.reviewerId ? <p><span className="text-muted">Revisada por:</span> {names.get(p.reviewerId) ?? "ex-membro"}{p.reviewedAt ? ` em ${formatDateTime(p.reviewedAt, tz)}` : ""}</p> : null}
            {p.submittedAt ? <p><span className="text-muted">Enviada por:</span> {p.submittedById ? (names.get(p.submittedById) ?? "ex-membro") : "—"} em {formatDateTime(p.submittedAt, tz)}</p> : null}
            {p.protocol ? <p><span className="text-muted">{info.officiallyFiled ? "Protocolo:" : info.testOnly ? "Protocolo de teste (sem valor oficial):" : "Protocolo informado:"}</span> <span className="font-mono">{p.protocol}</span></p> : null}
            {p.filingEnvironment && FILING_ENV_LABEL[p.filingEnvironment as FilingEnvironment] ? <p><span className="text-muted">Ambiente do envio:</span> {FILING_ENV_LABEL[p.filingEnvironment as FilingEnvironment]}</p> : null}
            {p.confirmedAt ? <p><span className="text-muted">Confirmada em:</span> {formatDateTime(p.confirmedAt, tz)}</p> : null}
            {p.unknownSince ? <p><span className="text-muted">Sem resposta do tribunal desde:</span> {formatDateTime(p.unknownSince, tz)}</p> : null}
          </CardBody>
        </Card>
      </div>

      {officialReceipt ? (
        <Card className="mt-4" data-testid="petition-official-receipt">
          <CardHeader title="Recibo do protocolo" description={officialReceipt.source === "MANUAL_ATTESTATION" ? "Registrado por uma pessoa do escritório, com o recibo do tribunal anexado ao processo." : "Recebido do tribunal no momento do envio."} />
          <CardBody className="space-y-1.5 text-sm">
            <p><span className="text-muted">Protocolo:</span> <span className="font-mono">{officialReceipt.protocol}</span></p>
            {officialReceipt.filedAt ? <p><span className="text-muted">Protocolada em:</span> {formatDateTime(officialReceipt.filedAt, tz)}</p> : null}
            {receiptDoc ? <p><span className="text-muted">Recibo anexado:</span> <Link href={`/documentos/${receiptDoc.id}`} className="text-primary-text hover:underline">{receiptDoc.name}</Link></p> : null}
            {officialReceipt.recordedById ? <p><span className="text-muted">Registrado por:</span> {names.get(officialReceipt.recordedById) ?? "ex-membro"}</p> : null}
            {officialReceipt.receiptText ? <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-surface-2 p-2 text-xs">{officialReceipt.receiptText}</pre> : null}
          </CardBody>
        </Card>
      ) : p.receipt ? (
        <Card className="mt-4">
          <CardHeader title="Retorno do envio" description={info.officiallyFiled ? undefined : "Texto devolvido pelo envio. Não é, por si só, um recibo oficial."} />
          <CardBody><pre className="whitespace-pre-wrap break-words text-xs">{p.receipt}</pre></CardBody>
        </Card>
      ) : null}

      {showReconcile ? (
        <Card className="mt-4">
          <CardHeader title={doubt ? "Conferir no tribunal" : "Já protocolou por fora?"} description={doubt ? "Só uma pessoa pode resolver esta dúvida." : "Registre o protocolo feito direto no sistema do tribunal."} />
          <CardBody>
            <ReconcilePanel id={p.id} documents={caseDocs} doubt={doubt} />
          </CardBody>
        </Card>
      ) : null}

      {attempts.length > 0 ? (
        <Card className="mt-4" data-testid="petition-attempts">
          <CardHeader title={`Tentativas de envio (${attempts.length})`} description="Cada envio fica registrado com o resultado, para nada ser reenviado às cegas." />
          <CardBody>
            <ul className="divide-y divide-border text-sm">
              {attempts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>#{a.attemptNo} · {formatDateTime(a.startedAt, tz)} · {FILING_ENV_LABEL[a.environment as FilingEnvironment] ?? a.environment}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={a.outcome === "CONFIRMED" ? "success" : a.outcome === "REJECTED" ? "danger" : a.outcome === "UNCERTAIN" || a.outcome === "STARTED" ? "warning" : "neutral"}>{ATTEMPT_LABEL[a.outcome] ?? a.outcome}</Badge>
                    {a.resolution ? <span className="text-xs text-muted">{a.resolution === "FILED" ? "conferida: protocolada" : a.resolution === "NOT_FILED" ? "conferida: não protocolada" : a.resolution}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader title={`Anexos (${attachments.length})`} description="Documentos do processo que vão junto da petição, na ordem abaixo e com a classificação escolhida. A versão de cada anexo é travada no envio para revisão." />
        <CardBody>
          {anyStale && status !== "DRAFT" ? <Alert tone="warning" className="mb-3">Algum anexo recebeu nova versão depois do envio para revisão. Devolva a petição ao rascunho e reenvie.</Alert> : null}
          <PetitionAttachments
            petitionId={p.id}
            rows={attachments.map((a) => ({ id: a.id, documentId: a.documentId, name: a.document.name, version: a.documentVersion, classification: a.classification as AttachmentClassKey, stale: a.stale }))}
            options={options}
            editable={editableAtt}
          />
        </CardBody>
      </Card>

      {status === "APPROVED" && can(ctx, "petitions:approve") ? (
        <Card className="mt-4">
          <CardHeader title="Agendar envio" description="Opcional: o sistema envia a versão aprovada no horário escolhido." />
          <CardBody>
            <ScheduleCard id={p.id} enabled={await getScheduleSwitch(ctx)} scheduledLabel={p.scheduledFor ? formatDateTime(p.scheduledFor, tz) : null} note={p.scheduleNote} real={!getPetitioningAdapter().isDemo} caseNumber={p.case.number} stale={stale || anyStale} />
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader title="Ações" description="Fluxo: rascunho → revisão → aprovação → envio. A versão do documento revisada é a mesma que será enviada." />
        <CardBody>
          {["DRAFT", "IN_REVIEW", "APPROVED", "FAILED"].includes(status) ? (
            <PetitionControls id={p.id} status={status} stale={stale || anyStale} canWrite={canWrite} canApprove={can(ctx, "petitions:approve")} real={!adapterIsDemo} caseNumber={p.case.number} canResend={canResend} resendBlockedReason={again.ok ? null : again.reason} />
          ) : (
            <p className="text-sm text-muted">{info.needsReconciliation ? "O reenvio está bloqueado até a conferência no tribunal (veja acima)." : status === "SUBMITTING" ? "Envio em andamento. Recarregue em instantes." : "Esta petição está encerrada."}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
