import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ForbiddenError } from "@/lib/permissions/check";
import { EMPTY_TASK } from "@/modules/tasks/schemas";
import { createTask, updateTask, changeTaskStatus, runTaskCompletionWorkflows } from "@/server/services/task.service";
import { saveTaskStage, setTaskStage } from "@/server/services/task-stage.service";
import { uploadDocument } from "@/server/services/document.service";
import { createRule, runWorkflows } from "@/server/services/workflow.service";
import { getOfficeSetup } from "@/server/services/office-setup.service";
import { makeOrgWithOwner } from "./helpers";

vi.mock("server-only", () => ({}));

const rule = (trigger: "TASK_COMPLETED" | "DOCUMENT_UPLOADED") => ({ name: "Próxima providência", trigger, taskTitle: "Revisar {{gatilho}}", taskDescription: "", dueDays: "1", priority: "NORMAL", assigneeMode: "TRIGGER_USER", assigneeId: "", active: true });

describe("Etapas de implantação e eventos entre módulos", () => {
  it("conclusão por cadastro, edição, situação e quadro dispara uma vez por tarefa", async () => {
    const a = await makeOrgWithOwner("stage-complete");
    const r = await createRule(a.ctx, rule("TASK_COMPLETED"));
    const initial = await createTask(a.ctx, { ...EMPTY_TASK, title: "Já concluída", status: "DONE" });
    const edited = await createTask(a.ctx, { ...EMPTY_TASK, title: "Concluir editando" });
    await updateTask(a.ctx, edited.id, { ...EMPTY_TASK, title: edited.title, status: "DONE" });
    const changed = await createTask(a.ctx, { ...EMPTY_TASK, title: "Concluir situação" });
    await changeTaskStatus(a.ctx, changed.id, "DONE");
    await changeTaskStatus(a.ctx, changed.id, "TODO");
    await changeTaskStatus(a.ctx, changed.id, "DONE");
    const staged = await createTask(a.ctx, { ...EMPTY_TASK, title: "Concluir no quadro" });
    const stage = await saveTaskStage(a.ctx, null, { name: "Entregue", status: "DONE", position: 1, active: true });
    await setTaskStage(a.ctx, staged.id, stage.id);
    const runs = await db.workflowRun.findMany({ where: { organizationId: a.org.id, ruleId: r.id } });
    expect(runs).toHaveLength(4);
    expect(new Set(runs.map(x => x.sourceId))).toEqual(new Set([initial.id, edited.id, changed.id, staged.id]));
    expect(runs.every(x => x.status === "CREATED" && x.taskId)).toBe(true);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: { startsWith: "Revisar " } } })).toBe(4);
  });

  it("envio de documento cria tarefa no mesmo processo e escritório", async () => {
    const a = await makeOrgWithOwner("stage-doc");
    await createRule(a.ctx, rule("DOCUMENT_UPLOADED"));
    const c = await db.case.create({ data: { organizationId: a.org.id, title: "Processo do documento" } });
    const d = await uploadDocument(a.ctx, { caseId: c.id }, { name: "prova.pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
    const run = await db.workflowRun.findFirstOrThrow({ where: { organizationId: a.org.id, sourceId: d.id } });
    const task = await db.task.findUniqueOrThrow({ where: { id: run.taskId! } });
    expect(task).toMatchObject({ organizationId: a.org.id, caseId: c.id, title: "Revisar prova.pdf", assigneeId: a.owner.id });
  });

  it("execuções concorrentes não duplicam a tarefa", async () => {
    const a = await makeOrgWithOwner("stage-race");
    await createRule(a.ctx, rule("TASK_COMPLETED"));
    const source = await createTask(a.ctx, { ...EMPTY_TASK, title: "Origem concorrente" });
    const results = await Promise.all([runTaskCompletionWorkflows(a.ctx, source), runTaskCompletionWorkflows(a.ctx, source)]);
    expect(results.reduce((sum, n) => sum + n, 0)).toBe(1);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: "Revisar Origem concorrente" } })).toBe(1);
  });

  it("falha ao registrar resultado desfaz tarefa e permite repetição sem duplicidade", async () => {
    const a = await makeOrgWithOwner("stage-rollback");
    await createRule(a.ctx, rule("TASK_COMPLETED"));
    const source = await createTask(a.ctx, { ...EMPTY_TASK, title: "Origem para retentar" });
    const log = vi.spyOn(logger, "error").mockImplementation(() => {});
    await db.$executeRawUnsafe(`CREATE FUNCTION stages_reject_result() RETURNS trigger AS $$ BEGIN IF NEW.source_id::text = TG_ARGV[0] AND NEW.status::text = 'CREATED' THEN RAISE EXCEPTION 'simulated result failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER stages_reject_result BEFORE UPDATE ON workflow_runs FOR EACH ROW EXECUTE FUNCTION stages_reject_result('${source.id}')`);
    try {
      expect(await runTaskCompletionWorkflows(a.ctx, source)).toBe(0);
      expect(await db.task.count({ where: { organizationId: a.org.id, title: "Revisar Origem para retentar" } })).toBe(0);
      expect(await db.workflowRun.findFirst({ where: { organizationId: a.org.id, sourceId: source.id } })).toMatchObject({ status: "FAILED", taskId: null });
    } finally {
      await db.$executeRawUnsafe("DROP TRIGGER stages_reject_result ON workflow_runs");
      await db.$executeRawUnsafe("DROP FUNCTION stages_reject_result()");
      log.mockRestore();
    }
    expect(await runTaskCompletionWorkflows(a.ctx, source)).toBe(1);
    expect(await runTaskCompletionWorkflows(a.ctx, source)).toBe(0);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: "Revisar Origem para retentar" } })).toBe(1);
  });

  it("recusa origem de outro escritório", async () => {
    const a = await makeOrgWithOwner("stage-own");
    const b = await makeOrgWithOwner("stage-other");
    const c = await db.case.create({ data: { organizationId: b.org.id, title: "Reservado B" } });
    await createRule(a.ctx, rule("TASK_COMPLETED"));
    const log = vi.spyOn(logger, "error").mockImplementation(() => {});
    try {
      expect(await runWorkflows(a.ctx, "TASK_COMPLETED", { type: "task", id: c.id, caseId: c.id, userId: a.owner.id, label: "Outro escritório", baseDate: "2026-10-27" })).toBe(0);
      expect(await db.workflowRun.count({ where: { organizationId: a.org.id } })).toBe(0);
    } finally { log.mockRestore(); }
  });

  it("implantação exige administração e não consulta módulos sem permissão", async () => {
    const a = await makeOrgWithOwner("stage-setup");
    await expect(getOfficeSetup({ ...a.ctx, permissions: new Set() })).rejects.toBeInstanceOf(ForbiddenError);
    const spy = vi.spyOn(db.case, "count");
    try {
      const steps = await getOfficeSetup({ ...a.ctx, permissions: new Set(["organization:manage"]) });
      expect(steps.map(x => x.id)).toEqual(["security", "mobile", "training"]);
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it("implantação calcula a carteira apenas do escritório atual", async () => {
    const a = await makeOrgWithOwner("stage-setup-A");
    const b = await makeOrgWithOwner("stage-setup-B");
    await db.case.createMany({ data: [{ organizationId: a.org.id, title: "A" }, { organizationId: b.org.id, title: "B1" }, { organizationId: b.org.id, title: "B2" }] });
    const steps = await getOfficeSetup(a.ctx);
    expect(steps.find(x => x.id === "cases")).toMatchObject({ status: "CONFIGURED", description: expect.stringContaining("1 processos visíveis") });
    expect(steps.find(x => x.id === "finance")?.status).toBe("PENDING");
  });
});
