/** Authentication enrollment links must not leak into conversation lists or dashboards. */
export function safeChatPreview(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/otpauth(?:-migration)?:\/\/[^\s<>"']*/gi, "[Dados de autenticação ocultos]");
}
