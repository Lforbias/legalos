import type { PermissionKey } from "./catalog";

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "Você não tem permissão para executar esta ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "Registro não encontrado.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";
  constructor(message = "Sessão inválida ou expirada.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ConflictError extends Error {
  readonly code = "CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export function hasPermission(permissions: ReadonlySet<string>, permission: PermissionKey): boolean {
  return permissions.has(permission);
}

/** `true` se `actor` possui todas as permissões em `required` (usado contra escalonamento de privilégios). */
export function isSubset(required: Iterable<string>, actor: ReadonlySet<string>): boolean {
  for (const p of required) if (!actor.has(p)) return false;
  return true;
}
