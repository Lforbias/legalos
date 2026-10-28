import { base32Decode, base32Encode } from "@/lib/security/totp";
import { ValidationError } from "@/lib/permissions/check";

/** Only the declared supported Keycloak/TOTP profile. Never guess parameters. */
export function parseCourtOtpSecret(raw: string): string {
  let secret = raw.trim();
  if (secret.startsWith("otpauth://")) {
    let uri: URL;
    try { uri = new URL(secret); } catch { throw new ValidationError("Endereço de autenticador inválido."); }
    if (uri.hostname !== "totp" || uri.username || uri.password) throw new ValidationError("Use um autenticador TOTP.");
    for (const field of ["secret", "algorithm", "digits", "period"]) if (uri.searchParams.getAll(field).length > 1) throw new ValidationError("Configuração de autenticador ambígua.");
    if ((uri.searchParams.get("algorithm") ?? "SHA1").toUpperCase() !== "SHA1" || (uri.searchParams.get("digits") ?? "6") !== "6" || (uri.searchParams.get("period") ?? "30") !== "30") throw new ValidationError("Este autenticador precisa usar SHA1, 6 dígitos e intervalo de 30 segundos.");
    secret = uri.searchParams.get("secret") ?? "";
  }
  secret = secret.replace(/\s/g, "").toUpperCase().replace(/=+$/, "");
  if (!/^[A-Z2-7]{16,128}$/.test(secret) || base32Encode(base32Decode(secret)) !== secret) throw new ValidationError("Informe a chave Base32 válida do autenticador do tribunal.");
  return secret;
}
