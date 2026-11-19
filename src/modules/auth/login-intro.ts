/**
 * Animação de entrada logo depois do login.
 *
 * O formulário de login grava um carimbo de hora no sessionStorage (só desta aba) e o painel
 * consome esse carimbo uma única vez: a animação toca no primeiro carregamento após entrar e
 * nunca nas navegações seguintes. Carimbos velhos (ex.: login que foi para o onboarding) expiram.
 */
export const LOGIN_INTRO_KEY = "lo-login-intro";
export const LOGIN_INTRO_TTL_MS = 2 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // modo privado / armazenamento bloqueado: segue sem animação
  }
}

export function markLoginIntro(storage: StorageLike | null = sessionStore(), now = Date.now()) {
  try {
    storage?.setItem(LOGIN_INTRO_KEY, String(now));
  } catch {
    /* sem armazenamento, sem animação */
  }
}

/** Lê e apaga o carimbo; true só se ele existir e for recente. */
export function consumeLoginIntro(storage: StorageLike | null = sessionStore(), now = Date.now()): boolean {
  try {
    const raw = storage?.getItem(LOGIN_INTRO_KEY);
    if (!raw) return false;
    storage?.removeItem(LOGIN_INTRO_KEY);
    const at = Number(raw);
    return Number.isFinite(at) && now - at >= 0 && now - at <= LOGIN_INTRO_TTL_MS;
  } catch {
    return false;
  }
}

export function greetingFor(hour: number): string {
  return hour < 5 ? "Boa noite" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

const TITLES = /^(dr|dra|sr|sra|srta|prof|profa)\.?$/i;

/** Primeiro nome, sem pronome de tratamento ("Dra. Helena Albuquerque" → "Helena"). */
export function firstName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.find((p) => !TITLES.test(p)) ?? parts[0] ?? "";
}
