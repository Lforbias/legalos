/**
 * Limitador de taxa em memória (janela deslizante simples).
 * LIMITAÇÃO CONHECIDA: o estado é por processo. Com várias instâncias, substitua o `store`
 * por Redis/Upstash (a interface é a mesma). Registrado em docs/security.md.
 */
type Entry = { hits: number[] };

export class RateLimiter {
  private store = new Map<string, Entry>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Retorna `true` se a requisição pode prosseguir. */
  check(key: string, now = Date.now()): boolean {
    const entry = this.store.get(key) ?? { hits: [] };
    entry.hits = entry.hits.filter((t) => now - t < this.windowMs);
    if (entry.hits.length >= this.limit) {
      this.store.set(key, entry);
      return false;
    }
    entry.hits.push(now);
    this.store.set(key, entry);
    if (this.store.size > 10_000) this.prune(now);
    return true;
  }

  reset(key: string) {
    this.store.delete(key);
  }

  private prune(now: number) {
    for (const [k, v] of this.store) if (v.hits.every((t) => now - t >= this.windowMs)) this.store.delete(k);
  }
}

/**
 * Multiplicador opcional dos limites de autenticação (`RATE_LIMIT_MULTIPLIER`, padrão 1 = sem alteração).
 * Existe para os testes E2E, que criam muitas contas a partir do mesmo IP. Não use valores altos em produção.
 */
const mult = Math.max(1, Number.parseInt(process.env.RATE_LIMIT_MULTIPLIER ?? "1", 10) || 1);

export const limiters = {
  login: new RateLimiter(8 * mult, 15 * 60_000),
  register: new RateLimiter(5 * mult, 60 * 60_000),
  passwordReset: new RateLimiter(5 * mult, 60 * 60_000),
  mfa: new RateLimiter(20 * mult, 15 * 60_000),
  invitation: new RateLimiter(30 * mult, 60 * 60_000),
  apiKey: new RateLimiter(120 * mult, 60_000),
  apiAuthFail: new RateLimiter(30 * mult, 60_000),
  mcp: new RateLimiter(90 * mult, 60_000),
  oauth: new RateLimiter(30 * mult, 60_000),
};
