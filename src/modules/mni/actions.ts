"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import {
  AUTH_MODES,
  inspectConnectionContract,
  consultCaseMni,
  importAutosMni,
  createConnection,
  updateConnectionTarget,
  deleteConnection,
  setConnectionEnabled,
  syncAvisos,
  type ConsultCaseResult,
  type ImportAutosResult,
  type SyncAvisosResult,
} from "@/server/services/mni.service";
import { setPetitionTypes } from "@/server/services/mni-petition.service";
import { prepareOfficialMniTargets } from "@/server/services/mni-catalog.service";
import { requireTenant } from "@/server/session";

const connectionSchema = z.object({
  wsdlUrl: z.string().trim().max(2000).optional(),
  authProfile: z.enum(["STATIC", "TJPR_SCMPP"]).optional(),
  system: z.enum(["pje-mni", "eproc", "esaj", "projudi"]).optional(),
  environment: z.enum(["HOMOLOGATION", "PRODUCTION", "UNSPECIFIED"]).optional(),
  label: z.string().trim().min(2, "Dê um nome à conexão.").max(80),
  jtr: z.string().trim(),
  endpointUrl: z.string().trim().min(8, "Informe o endereço do serviço."),
  authMode: z.enum(AUTH_MODES),
  certificateId: z.string().trim().optional(),
  document: z.string().trim().min(1, "Informe o identificador de acesso.").max(120),
  password: z.string().optional(),
});

export async function createConnectionAction(input: z.input<typeof connectionSchema>): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(connectionSchema, input);
    await createConnection(ctx, { ...v, certificateId: v.certificateId || null });
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function setConnectionEnabledAction(id: string, enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setConnectionEnabled(ctx, parse(uuidSchema, id), parse(z.boolean(), enabled));
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function deleteConnectionAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteConnection(ctx, parse(uuidSchema, id));
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function syncAvisosAction(id: string): Promise<ActionState<SyncAvisosResult>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await syncAvisos(ctx, parse(uuidSchema, id));
    revalidatePath("/integracoes");
    revalidatePath("/caixa-de-entrada");
    return r;
  });
}

export async function consultCaseMniAction(caseId: string): Promise<ActionState<ConsultCaseResult>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const id = parse(uuidSchema, caseId);
    const r = await consultCaseMni(ctx, id);
    revalidatePath(`/processos/${id}`);
    return r;
  });
}

export async function importAutosMniAction(caseId: string): Promise<ActionState<ImportAutosResult>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const id = parse(uuidSchema, caseId);
    const r = await importAutosMni(ctx, id);
    revalidatePath(`/processos/${id}`);
    revalidatePath(`/processos/${id}/autos`);
    return r;
  });
}

export async function setPetitionTypesAction(id: string, types: Record<string, string>): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setPetitionTypes(ctx, parse(uuidSchema, id), parse(z.record(z.string(), z.string().max(40)), types));
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function inspectContractAction(id: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const result = await inspectConnectionContract(ctx, parse(uuidSchema, id));
    revalidatePath("/integracoes");
    return result;
  });
}

export async function updateConnectionTargetAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ endpointUrl: z.string().trim().min(8).max(2000), wsdlUrl: z.string().trim().max(2000).optional(), environment: z.enum(["HOMOLOGATION", "PRODUCTION", "UNSPECIFIED"]), jtr: z.string().max(10) }), input);
    await updateConnectionTarget(ctx, parse(uuidSchema, id), v);
    revalidatePath("/integracoes"); revalidatePath("/certificados");
    return undefined;
  });
}

export async function prepareOfficialTargetsAction(input: unknown) {
  return runAction(async () => { const { ctx } = await requireTenant(); const result = await prepareOfficialMniTargets(ctx, input); revalidatePath("/integracoes"); revalidatePath("/certificados"); return result; });
}
