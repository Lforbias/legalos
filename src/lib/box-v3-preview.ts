/**
 * Box 3.0 permits historical reads and explicitly authorized internal actions. It is available locally in
 * development, or when explicitly enabled for a controlled preview. It never
 * enables the retired Box endpoints or background jobs.
 */
export function boxV3PreviewEnabled() {
  return process.env.NODE_ENV === "development" || process.env.LEGALOS_BOX3_PREVIEW === "1";
}
