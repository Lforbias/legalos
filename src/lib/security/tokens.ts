import crypto from "node:crypto";

/** Token opaco aleatório (256 bits) em base64url. Só o hash é guardado no banco. */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
