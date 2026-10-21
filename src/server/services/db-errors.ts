/** Detecta violação de unicidade (Prisma P2002 ou SQLSTATE 23505 vindo do driver). */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; cause?: { originalCode?: string; code?: string } };
  return e.code === "P2002" || e.cause?.originalCode === "23505" || e.cause?.code === "23505";
}

/** Violação de chave estrangeira (P2003 / 23503) — inclui a FK composta multi-tenant. */
export function isForeignKeyViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; cause?: { originalCode?: string; code?: string } };
  return e.code === "P2003" || e.cause?.originalCode === "23503" || e.cause?.code === "23503";
}
