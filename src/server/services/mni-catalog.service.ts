import { z } from "zod";
import { db } from "@/lib/db/client";
import { OFFICIAL_MNI_TARGETS } from "@/lib/connectors/official-targets";
import { isValidCpf, onlyDigits } from "@/lib/validation/br-documents";
import { ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { restrictCertificateToConsultation, assertCertificateUsable } from "./certificate.service";
import { createConnection } from "./mni.service";

/** Preparation only. No request is made to any court; every newly created connection stays disabled. */
export async function prepareOfficialMniTargets(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "integrations:manage");
  const input = z.object({ certificateId: z.uuid(), document: z.string().max(20).refine(isValidCpf, "CPF inválido."), keys: z.array(z.string().max(40)).min(1).max(20) }).parse(raw);
  const keys = [...new Set(input.keys)];
  const targets = keys.map(key => OFFICIAL_MNI_TARGETS.find(target => target.key === key));
  if (targets.some(target => !target)) throw new ValidationError("Escolha somente destinos publicados no catálogo oficial.");
  await assertCertificateUsable(ctx, input.certificateId);
  const certificate = await db.certificate.findFirstOrThrow({ where: { id: input.certificateId, organizationId: ctx.organizationId }, select: { subjectCn: true } });
  const subjectCpf = /:(\d{11})(?:\b|$)/.exec(certificate.subjectCn)?.[1];
  if (subjectCpf && subjectCpf !== onlyDigits(input.document)) throw new ValidationError("O CPF informado não corresponde ao titular do certificado escolhido.");
  await restrictCertificateToConsultation(ctx, input.certificateId);
  let created = 0; let existing = 0;
  for (const target of targets) {
    if (!target) continue;
    if (await db.courtConnection.findFirst({ where: { organizationId: ctx.organizationId, endpointUrl: target.endpointUrl }, select: { id: true } })) { existing++; continue; }
    await createConnection(ctx, { label: `Consulta — ${target.label}`, system: "pje-mni", environment: target.environment, jtr: target.jtr, endpointUrl: target.endpointUrl, wsdlUrl: `${target.endpointUrl}?wsdl`, authMode: "CERTIFICATE", certificateId: input.certificateId, document: input.document, enabled: false });
    created++;
  }
  return { created, existing };
}
