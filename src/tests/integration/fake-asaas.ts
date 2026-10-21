import http from "node:http";
import type { AddressInfo } from "node:net";

/** Servidor que IMITA a API do Asaas (só para testes). Não prova compatibilidade com o Asaas real: serve para conferir o que o LegalOS envia e como reage. */
export type FakePayment = { id: string; customer: string; subscription: string; value: number; status: string; dueDate: string; paymentDate?: string | null; invoiceUrl: string; billingType: string; deleted?: boolean };
export type Req = { method: string; path: string; body: Record<string, unknown> | null; token: string | undefined };

export function startFakeAsaas() {
  let n = 0;
  const customers = new Map<string, Record<string, unknown>>();
  const subs = new Map<string, { id: string; customer: string; status: string; value: number; deleted?: boolean }>();
  const payments = new Map<string, FakePayment>();
  const requests: Req[] = [];
  const state = { down: false, failNext: null as null | { match: RegExp; status: number; description: string } };
  const nextId = (p: string) => `${p}_${++n}`;

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const path = url.pathname;
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      requests.push({ method: req.method ?? "", path, body, token: req.headers["access_token"] as string | undefined });
      const send = (status: number, json: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
      if (req.headers["access_token"] !== "chave-de-teste") return send(401, { errors: [{ description: "Chave inválida" }] });
      if (state.down) return send(500, { errors: [{ description: "indisponível" }] });
      if (state.failNext && state.failNext.match.test(`${req.method} ${path}`)) {
        const f = state.failNext;
        state.failNext = null;
        return send(f.status, { errors: [{ description: f.description }] });
      }
      let m: RegExpMatchArray | null;
      if (req.method === "POST" && path === "/customers") {
        const id = nextId("cus");
        customers.set(id, body ?? {});
        return send(200, { id });
      }
      if ((m = path.match(/^\/customers\/([^/]+)$/)) && req.method === "PUT") {
        if (!customers.has(m[1]!)) return send(404, { errors: [{ description: "Cliente não encontrado" }] });
        customers.set(m[1]!, body ?? {});
        return send(200, { id: m[1] });
      }
      if (req.method === "POST" && path === "/subscriptions") {
        const id = nextId("sub");
        const value = Number(body?.value);
        subs.set(id, { id, customer: String(body?.customer), status: "ACTIVE", value });
        const pid = nextId("pay");
        payments.set(pid, { id: pid, customer: String(body?.customer), subscription: id, value, status: "PENDING", dueDate: String(body?.nextDueDate), invoiceUrl: `https://sandbox.asaas.com/i/${pid}`, billingType: "UNDEFINED" });
        return send(200, { id, customer: body?.customer, status: "ACTIVE", value });
      }
      if ((m = path.match(/^\/subscriptions\/([^/]+)\/payments$/))) {
        return send(200, { data: [...payments.values()].filter((p) => p.subscription === m![1]) });
      }
      if ((m = path.match(/^\/subscriptions\/([^/]+)$/))) {
        const s = subs.get(m[1]!);
        if (!s) return send(404, { errors: [{ description: "Assinatura não encontrada" }] });
        if (req.method === "GET") return send(200, s);
        if (req.method === "PUT") { s.value = Number(body?.value); return send(200, s); }
        if (req.method === "DELETE") { s.deleted = true; s.status = "INACTIVE"; return send(200, { deleted: true }); }
      }
      if ((m = path.match(/^\/payments\/([^/]+)$/)) && req.method === "GET") {
        const p = payments.get(m[1]!);
        return p ? send(200, p) : send(404, { errors: [{ description: "Cobrança não encontrada" }] });
      }
      return send(404, { errors: [{ description: "rota desconhecida" }] });
    });
  });

  return {
    start: () => new Promise<string>((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
    stop: () => new Promise<void>((r) => server.close(() => r())),
    state, requests, customers, subs, payments,
    count: (method: string, pathRe: RegExp) => requests.filter((q) => q.method === method && pathRe.test(q.path)).length,
    firstPaymentOf: (subId: string) => [...payments.values()].find((p) => p.subscription === subId)!,
    addPayment: (subId: string, dueDate: string, status = "PENDING") => {
      const s = subs.get(subId)!;
      const id = nextId("pay");
      const p: FakePayment = { id, customer: s.customer, subscription: subId, value: s.value, status, dueDate, invoiceUrl: `https://sandbox.asaas.com/i/${id}`, billingType: "UNDEFINED" };
      payments.set(id, p);
      return p;
    },
  };
}
