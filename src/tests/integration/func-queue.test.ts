import { expect, it } from "vitest";
import { createFuncQueue, FUNC_PUSH_QUEUE } from "@/server/queues/func";

it("persiste lembretes, impede execução concorrente e registra conclusão", async () => {
  const url = process.env.TEST_DATABASE_URL!;
  let boss = await createFuncQueue(url);
  const id = await boss.send(FUNC_PUSH_QUEUE, {});
  await boss.stop();
  boss = await createFuncQueue(url);
  try {
    const jobs = await boss.fetch(FUNC_PUSH_QUEUE);
    expect(jobs.map(job => job.id)).toContain(id);
    expect(await boss.fetch(FUNC_PUSH_QUEUE)).toEqual([]);
    await boss.complete(FUNC_PUSH_QUEUE, id!);
    expect((await boss.getJobById(FUNC_PUSH_QUEUE, id!))?.state).toBe("completed");
  } finally {
    await boss.stop();
  }
});
