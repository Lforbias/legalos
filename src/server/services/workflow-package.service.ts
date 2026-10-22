import { db } from "@/lib/db/client";
import { addDays } from "@/lib/dates/ymd";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { packageSchema, runSchema, SEED_PACKAGES, type PackageInput, type RunInput } from "@/modules/kanban/package-schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertActiveMember, assertCaseVisible } from "./case.service";
import { createCard } from "./kanban.service";
import { createTask } from "./task.service";

/**
 * 2.0-F3 — pacotes de tarefas ("workflows" prontos do escritório). Um pacote é uma lista editável de tarefas com prazo em
 * dias a partir de uma data base. Executar cria as tarefas de uma vez (sempre por decisão de uma pessoa; nada é automático).
 * Ver = tasks:read; editar pacotes = organization:manage; executar = tasks:write.
 */
export async function ensureSeedPackages(organizationId: string) {
  const have = await db.workflowPackage.findMany({ where: { organizationId, seedKey: { not: null } }, select: { seedKey: true } });
  const has = new Set(have.map((h) => h.seedKey));
  for (const s of SEED_PACKAGES) {
    if (has.has(s.key)) continue;
    await db.workflowPackage
      .create({
        data: {
          organizationId, seedKey: s.key, name: s.name, description: s.description,
          steps: { create: s.steps.map((st, i) => ({ organizationId, position: i, title: st.title, description: st.description ?? null, dueDays: st.dueDays, priority: st.priority ?? "NORMAL", ask: st.ask ?? null })) },
        },
      })
      .catch(() => null); // corrida: outra requisição criou primeiro (índice único em seed_key)
  }
}

export async function listPackages(ctx: TenantContext, opts: { onlyActive?: boolean } = {}) {
  assertCan(ctx, "tasks:read");
  await ensureSeedPackages(ctx.organizationId);
  return db.workflowPackage.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, ...(opts.onlyActive ? { active: true } : {}) },
    orderBy: { createdAt: "asc" },
    include: { steps: { orderBy: { position: "asc" } } },
  });
}

async function pkg(ctx: TenantContext, id: string) {
  const p = await db.workflowPackage.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, include: { steps: { orderBy: { position: "asc" } } } });
  if (!p) throw new NotFoundError("Pacote não encontrado.");
  return p;
}

export async function savePackage(ctx: TenantContext, id: string | null, raw: PackageInput) {
  assertCan(ctx, "organization:manage");
  const v = packageSchema.parse(raw);
  for (const s of v.steps) if (s.assigneeId) await assertActiveMember(ctx, s.assigneeId);
  const data = v.steps.map((s, i) => ({ organizationId: ctx.organizationId, position: i, title: s.title, description: s.description || null, dueDays: s.dueDays, priority: s.priority, assigneeId: s.assigneeId || null, ask: s.ask || null }));
  let savedId = id;
  await db.$transaction(async (tx) => {
    if (id) {
      await pkg(ctx, id);
      await tx.workflowPackage.update({ where: { id }, data: { name: v.name, description: v.description || null, active: v.active } });
      await tx.workflowPackageStep.deleteMany({ where: { packageId: id } });
      await tx.workflowPackageStep.createMany({ data: data.map((d) => ({ ...d, packageId: id })) });
    } else {
      const c = await tx.workflowPackage.create({ data: { organizationId: ctx.organizationId, name: v.name, description: v.description || null, active: v.active, createdById: ctx.userId, steps: { create: data } } });
      savedId = c.id;
    }
  });
  await audit({ action: id ? "workflow_package.update" : "workflow_package.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "workflow_package", resourceId: savedId ?? undefined, meta: ctx.meta });
  return savedId!;
}

export async function deletePackage(ctx: TenantContext, id: string) {
  assertCan(ctx, "organization:manage");
  await pkg(ctx, id);
  await db.workflowPackage.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await audit({ action: "workflow_package.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "workflow_package", resourceId: id, meta: ctx.meta });
}

export async function runPackage(ctx: TenantContext, packageId: string, raw: RunInput) {
  assertCan(ctx, "tasks:write");
  const v = runSchema.parse(raw);
  const p = await pkg(ctx, packageId);
  if (!p.active) throw new ConflictError("Este pacote está desativado.");
  if (!v.caseId && !v.clientId) throw new ValidationError("Escolha o processo ou o cliente.", { caseId: ["Informe o processo ou o cliente."] });
  const kase = v.caseId ? await assertCaseVisible(ctx, v.caseId) : null;
  for (const s of p.steps) if (s.ask && !(v.answers[s.id] ?? "").trim()) throw new ValidationError(`Responda: ${s.ask}`, { [s.id]: [`Responda: ${s.ask}`] });
  if (v.caseId && !v.force) {
    const dup = await db.workflowPackageRun.findFirst({ where: { organizationId: ctx.organizationId, packageId, caseId: v.caseId }, select: { createdAt: true } });
    if (dup) throw new ConflictError("Este pacote já foi executado neste processo. Confirme para executar de novo.");
  }
  const members = new Set((await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE" }, select: { userId: true } })).map((m) => m.userId));
  const run = await db.workflowPackageRun.create({ data: { organizationId: ctx.organizationId, packageId, caseId: v.caseId || null, clientId: v.clientId || null, baseDate: new Date(`${v.baseDate}T00:00:00Z`), createdById: ctx.userId } });
  let made = 0;
  const failed: string[] = [];
  for (const s of p.steps) {
    const answer = (v.answers[s.id] ?? "").trim();
    try {
      await createTask(ctx, {
        title: s.title, status: "TODO", priority: s.priority,
        description: [s.description ?? "", answer ? `${s.ask}: ${answer}` : "", `Pacote: ${p.name}`].filter(Boolean).join("\n\n"),
        dueDate: addDays(v.baseDate, s.dueDays),
        assigneeId: s.assigneeId && members.has(s.assigneeId) ? s.assigneeId : "",
        caseId: v.caseId, clientId: v.clientId,
      });
      made++;
    } catch {
      failed.push(s.title);
    }
  }
  let cardId: string | null = null;
  if (v.boardId) {
    const c = await createCard(ctx, v.boardId, { title: `${p.name}${kase ? ` — ${kase.title}` : ""}`.slice(0, 200), caseId: v.caseId, clientId: v.clientId, dueDate: addDays(v.baseDate, Math.max(...p.steps.map((s) => s.dueDays))) }, { runId: run.id });
    cardId = c.id;
  }
  await db.workflowPackageRun.update({ where: { id: run.id }, data: { taskCount: made, cardId } });
  await audit({ action: "workflow_package.run", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "workflow_package_run", resourceId: run.id, metadata: { packageId, tasks: made, failed: failed.length }, meta: ctx.meta });
  return { runId: run.id, created: made, failed, cardId };
}

export async function listRunsForCase(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "tasks:read");
  await assertCaseVisible(ctx, caseId);
  const runs = await db.workflowPackageRun.findMany({ where: { organizationId: ctx.organizationId, caseId }, orderBy: { createdAt: "desc" }, take: 20, include: { package: { select: { name: true } } } });
  return runs.map((r) => ({ id: r.id, name: r.package.name, taskCount: r.taskCount, createdAt: r.createdAt }));
}
