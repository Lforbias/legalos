import PgBoss from "pg-boss";

export const FUNC_PUSH_QUEUE = "func-push-due";

export async function createFuncQueue(connectionString: string) {
  const boss = new PgBoss({ connectionString, schema: "func_jobs" });
  boss.on("error", () => console.error("Falha na fila FUNC."));
  await boss.start();
  try {
    await boss.createQueue(FUNC_PUSH_QUEUE, {
      name: FUNC_PUSH_QUEUE,
      policy: "singleton",
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 300,
    });
    return boss;
  } catch (error) {
    await boss.stop();
    throw error;
  }
}

export async function enqueuePushDue() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");
  const boss = await createFuncQueue(url);
  try {
    return await boss.send(FUNC_PUSH_QUEUE, {}, { singletonKey: "push-due" });
  } finally {
    await boss.stop();
  }
}
