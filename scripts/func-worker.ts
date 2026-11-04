import "./load-env";
import { createFuncQueue, FUNC_PUSH_QUEUE } from "../src/server/queues/func";
import { runPushDue } from "../src/server/services/push.service";
import { withJobRun } from "../src/server/job-runs";

async function main() {
  if (process.env.FUNC_QUEUE_ENABLED !== "1") throw new Error("Ative FUNC_QUEUE_ENABLED=1 para iniciar o worker.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");
  const boss = await createFuncQueue(url);
  await boss.work(FUNC_PUSH_QUEUE, async () => {
    await withJobRun("push-due", "CRON", () => runPushDue());
  });
  const shutdown = async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  console.log("Worker FUNC pronto.");
}
main().catch(() => {
  console.error("Não foi possível iniciar o worker FUNC.");
  process.exit(1);
});
