/* global chrome */
import { API_ORIGIN, courtOrigin, normalizedCnj } from "./common.mjs";
const ready = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let serial = Promise.resolve();
const exclusive = fn => { const run = serial.then(fn, fn); serial = run.catch(() => {}); return run; };
async function request(token, method, data) {
  const res = await fetch(`${API_ORIGIN}/api/v1/pje/discoveries`, { method, credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
  if (!res.ok) { const error = new Error(res.status === 401 || res.status === 403 ? "Chave recusada ou sem o acesso PJe: registrar números. Confira a conexão." : "Não foi possível sincronizar. A fila local foi mantida para tentar de novo."); error.status = res.status; throw error; }
  return res.json();
}
async function flush() {
  const { config, queue = [] } = await chrome.storage.local.get(["config", "queue"]);
  if (!config?.token) throw new Error("Conecte sua chave do LegalOS primeiro.");
  try {
    const sameBinding = queue.filter(item => item.binding === config.binding);
    for (const origin of [...new Set(sameBinding.map(item => item.origin))]) {
      const group = sameBinding.filter(item => item.origin === origin);
      for (let offset = 0; offset < group.length; offset += 50) {
      const items = group.slice(offset, offset + 50);
      await request(config.token, "POST", { sourceOrigin: origin, numbers: items.map(item => item.number) });
      const { queue: latest = [] } = await chrome.storage.local.get("queue");
      const keys = new Set(items.map(item => `${item.binding}:${item.number}`));
      await chrome.storage.local.set({ queue: latest.filter(item => !keys.has(`${item.binding}:${item.number}`)), lastSync: new Date().toISOString(), lastError: "" });
      }
    }
  } catch (e) {
    await chrome.storage.local.set({ lastError: e.message, ...(e.status === 401 || e.status === 403 ? { config: { ...config, auto: false } } : {}) });
    throw e;
  }
}
async function handle(message, sender) {
  await ready;
  if (message?.type === "CAPTURE") {
    const origin = courtOrigin(sender.url || sender.tab?.url || "");
    const { config, origins = [], queue = [] } = await chrome.storage.local.get(["config", "origins", "queue"]);
    if (!sender.tab || sender.frameId !== 0 || !config?.token || !origin || !origins.includes(origin) || !await chrome.permissions.contains({ origins: [`${origin}/*`] })) throw new Error("Tribunal não autorizado ou LegalOS desconectado.");
    const numbers = [...new Set((Array.isArray(message.numbers) ? message.numbers.slice(0, 50) : []).map(normalizedCnj).filter(Boolean))];
    const known = new Set(queue.filter(item => item.binding === config.binding).map(item => item.number));
    const fresh = numbers.filter(number => !known.has(number));
    if (queue.length + fresh.length > 500) { await chrome.storage.local.set({ lastError: "Fila local cheia. Sincronize antes de continuar." }); throw new Error("Fila local cheia. Sincronize antes de continuar."); }
    await chrome.storage.local.set({ queue: [...queue, ...fresh.map(number => ({ number, origin, binding: config.binding }))] });
    if (config.auto) await flush().catch(() => {});
    return { ok: true };
  }
  if (!sender.url?.startsWith(chrome.runtime.getURL("")) || sender.tab) throw new Error("Comando permitido somente no painel da extensão.");
  if (message.type === "NOTICE_CONNECT" || message.type === "NOTICE_IMPORT") {
    const saved = await chrome.storage.local.get("noticeConfig");
    const token = message.type === "NOTICE_CONNECT" ? message.token : saved.noticeConfig?.token;
    if (typeof token !== "string" || !/^lgos_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Conecte uma chave com o acesso Box: importar metadados.");
    const importing = message.type === "NOTICE_IMPORT";
    if (importing && message.binding !== saved.noticeConfig?.binding) throw new Error("A conexão de importação mudou. Confira a lista novamente.");
    const response = await fetch(`${API_ORIGIN}/api/v1/portal/notices`, { method: importing ? "POST" : "GET", credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(importing ? { body: JSON.stringify(message.batch) } : {}) });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Chave sem acesso ou expirada. Use o escopo Box: importar metadados; a chave antiga de números CNJ não serve." : "Importação não confirmada. Confira a caixa de entrada e repita a mesma seleção; os registros são deduplicados.");
    const data = await response.json();
    if (!importing) await chrome.storage.local.set({ noticeConfig: { token, office: data.organizationName, binding: crypto.randomUUID() } });
    return { ok: true, ...data };
  }
  if (message.type === "NOTICE_STATE") { const { noticeConfig } = await chrome.storage.local.get("noticeConfig"); return { ok: true, office: noticeConfig?.office || null, binding: noticeConfig?.binding || null }; }
  if (message.type === "NOTICE_DISCONNECT") { await chrome.storage.local.remove("noticeConfig"); return { ok: true }; }
  if (message.type === "STATE") {
    const { config, origins = [], queue = [], lastError = "", lastSync } = await chrome.storage.local.get(["config", "origins", "queue", "lastError", "lastSync"]);
    return { ok: true, connected: Boolean(config?.token), office: config?.office, auto: Boolean(config?.auto), origins, pending: queue.length, lastError, lastSync };
  }
  if (message.type === "CONNECT") {
    if (typeof message.token !== "string" || !/^lgos_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/.test(message.token)) throw new Error("Informe a chave de API do LegalOS.");
    const identity = await request(message.token, "GET");
    await chrome.storage.local.set({ config: { token: message.token, binding: crypto.randomUUID(), office: identity.organizationName, auto: false }, queue: [], lastError: "", lastSync: null });
    return { ok: true };
  }
  if (message.type === "DISCONNECT") { await chrome.storage.local.remove(["config", "queue", "lastError", "lastSync"]); return { ok: true }; }
  if (message.type === "AUTO") {
    const { config } = await chrome.storage.local.get("config"); if (!config?.token) throw new Error("Conecte o LegalOS primeiro.");
    await chrome.storage.local.set({ config: { ...config, auto: message.enabled === true } }); return { ok: true };
  }
  if (message.type === "ADD_ORIGIN") {
    const origin = courtOrigin(message.origin);
    if (!origin || !await chrome.permissions.contains({ origins: [`${origin}/*`] })) throw new Error("Autorize este tribunal no navegador primeiro.");
    const { origins = [] } = await chrome.storage.local.get("origins");
    const next = [...new Set([...origins, origin])];
    await chrome.scripting.unregisterContentScripts({ ids: ["legalos-pje-capture"] }).catch(() => {});
    await chrome.scripting.registerContentScripts([{ id: "legalos-pje-capture", matches: next.map(value => `${value}/*`), js: ["content.js"], runAt: "document_idle", allFrames: false, persistAcrossSessions: true }]);
    await chrome.storage.local.set({ origins: next }); return { ok: true };
  }
  if (message.type === "REMOVE_ORIGIN") {
    const origin = courtOrigin(message.origin); if (!origin) throw new Error("Tribunal inválido.");
    const { origins = [] } = await chrome.storage.local.get("origins"); const next = origins.filter(value => value !== origin);
    await chrome.scripting.unregisterContentScripts({ ids: ["legalos-pje-capture"] }).catch(() => {});
    if (next.length) await chrome.scripting.registerContentScripts([{ id: "legalos-pje-capture", matches: next.map(value => `${value}/*`), js: ["content.js"], runAt: "document_idle", allFrames: false, persistAcrossSessions: true }]);
    await chrome.permissions.remove({ origins: [`${origin}/*`] }); await chrome.storage.local.set({ origins: next }); return { ok: true };
  }
  if (message.type === "SYNC") { await flush(); return { ok: true }; }
  throw new Error("Comando desconhecido.");
}
chrome.runtime.onMessage.addListener((message, sender, respond) => { exclusive(() => handle(message, sender)).then(respond, error => respond({ ok: false, message: error.message || "Não foi possível concluir." })); return true; });
chrome.alarms.create("legalos-pje-retry", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name !== "legalos-pje-retry") return; void exclusive(async () => { await ready; const { config } = await chrome.storage.local.get("config"); if (config?.auto) await flush(); }).catch(() => {}); });
