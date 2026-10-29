import { db } from "@/lib/db/client";
import { describeDjenRun, plainFailure, type PlainOutcome } from "@/lib/judicial/plain";
import { NotFoundError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { createMonitor, setMonitorEnabled, syncDjen, SyncFailedError, type SyncOptions } from "@/server/services/djen.service";
import { syncAvisos, type SoapPost } from "@/server/services/mni.service";
import { testPortalAccess } from "@/server/services/portal-access.service";

export type CheckOutcome = PlainOutcome & { durationMs: number; monitorId?: string; runId?: string };
export type CheckableKind = "DJEN" | "MNI" | "PORTAL";
type Opts = { djen?: Pick<SyncOptions, "http" | "pauseMs" | "evidenceEnvironment" | "now">; mniPost?: SoapPost };

/** Falha esperada da fonte (fora do ar, bloqueio, login recusado): vira um resultado explicado, não um erro genérico. */
function failureOutcome(code: string, started: number): CheckOutcome {
  const f = plainFailure(code);
  return { tone: "error", title: "A consulta não foi concluída", detail: `${f.what} ${f.next}`, durationMs: Date.now() - started };
}

/** Consulta real e imediata de uma fonte. O resultado é o que a fonte respondeu (inclusive falha), nunca uma simulação. */
export async function checkSource(ctx: TenantContext, kind: CheckableKind, id: string, opts: Opts = {}): Promise<CheckOutcome> {
  const started = Date.now();
  try {
    if (kind === "DJEN") {
      const r = await syncDjen(ctx, id, { trigger: "MANUAL", ...opts.djen });
      return { ...describeDjenRun(r), durationMs: Date.now() - started, runId: r.runId };
    }
    if (kind === "MNI") {
      assertCan(ctx, "inbox:write");
      const r = await syncAvisos(ctx, id, opts.mniPost);
      return { tone: "success", title: "Consulta concluída", detail: `Encontramos ${r.found} comunicação(ões): ${r.imported} nova(s) na Caixa de Entrada e ${r.alreadyKnown} que o LegalOS já tinha.`, durationMs: Date.now() - started };
    }
    await testPortalAccess(ctx, id);
    return { tone: "success", title: "Teste de login enviado", detail: "O robô está conferindo o acesso no portal. O resultado real aparece nesta tela em instantes; até lá, o acesso não é considerado funcionando.", durationMs: Date.now() - started };
  } catch (e) {
    if (e instanceof SyncFailedError) return failureOutcome(e.failureCode, started);
    throw e;
  }
}

/**
 * Passo B do assistente: liga o monitoramento público (DJEN) do profissional e FAZ uma consulta real na hora.
 * Reutiliza o monitoramento se a OAB já estiver monitorada (nunca duplica) e religa se estiver desligado.
 */
export async function startPublicMonitoring(ctx: TenantContext, professionalId: string, opts: Opts = {}): Promise<CheckOutcome> {
  assertCan(ctx, "integrations:manage");
  const prof = await db.professionalIdentity.findFirst({ where: { id: professionalId, organizationId: ctx.organizationId, active: true }, select: { id: true, name: true, oabNumber: true, oabUf: true } });
  if (!prof) throw new NotFoundError("Advogado não encontrado.");
  const started = Date.now();
  const existing = await db.djenMonitor.findFirst({ where: { organizationId: ctx.organizationId, oabNumber: prof.oabNumber, oabUf: prof.oabUf }, select: { id: true, enabled: true } });
  let monitorId: string;
  if (!existing) monitorId = (await createMonitor(ctx, { label: prof.name, oabNumber: prof.oabNumber, oabUf: prof.oabUf })).id;
  else {
    monitorId = existing.id;
    if (!existing.enabled) await setMonitorEnabled(ctx, existing.id, true);
  }
  try {
    const r = await syncDjen(ctx, monitorId, { trigger: "ONBOARDING", ...opts.djen });
    return { ...describeDjenRun(r), durationMs: Date.now() - started, monitorId, runId: r.runId };
  } catch (e) {
    if (e instanceof SyncFailedError) return { ...failureOutcome(e.failureCode, started), monitorId };
    throw e;
  }
}
