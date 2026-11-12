/** Evolution 1.0: departmental office experience.
 * Off by default. Set LEGALOS_EVOLUTION=1 to enable.
 * Client-side code reads the flag injected in the layout.
 */
const isOn = (v: string | undefined) => {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "on";
};

export function evolutionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return isOn(env.LEGALOS_EVOLUTION);
}
