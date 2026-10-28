/* global chrome */
import { courtOrigin } from "./common.mjs";
const el = id => document.getElementById(id);
let activeTab;
async function send(message) { const result = await chrome.runtime.sendMessage(message); if (!result?.ok) throw new Error(result?.message || "Extensão indisponível."); return result; }
async function refresh() {
  const s = await send({ type: "STATE" });
  el("office").textContent = s.connected ? `Escritório: ${s.office}` : "LegalOS desconectado.";
  el("pending").textContent = `${s.pending} número(s) na fila local.${s.lastSync ? ` Último envio: ${new Date(s.lastSync).toLocaleString("pt-BR")}.` : ""}`;
  el("auto").checked = s.auto; el("auto").disabled = !s.connected; el("sync").disabled = !s.connected || !s.pending;
  el("authorize").disabled = !s.connected || !courtOrigin(activeTab?.url || "");
  el("origins").replaceChildren();
  for (const origin of s.origins) { const row = document.createElement("p"); row.textContent = origin; const remove = document.createElement("button"); remove.textContent = "Remover"; remove.onclick = () => run(async () => { await send({ type: "REMOVE_ORIGIN", origin }); await refresh(); }); row.append(remove); el("origins").append(row); }
  if (s.lastError) el("status").textContent = s.lastError;
}
async function run(fn) { el("status").textContent = ""; try { await fn(); } catch (error) { el("status").textContent = error.message; } }
el("connection").onsubmit = event => { event.preventDefault(); const token = el("token").value.trim(); el("token").value = ""; void run(async () => { await send({ type: "CONNECT", token }); await refresh(); el("status").textContent = "Conexão confirmada. Confira o escritório antes de ligar o envio automático. A fila anterior foi apagada."; }); };
el("auto").onchange = () => run(async () => { await send({ type: "AUTO", enabled: el("auto").checked }); await refresh(); });
el("sync").onclick = () => run(async () => { await send({ type: "SYNC" }); await refresh(); el("status").textContent = "Envio concluído. Confira os números no LegalOS."; });
el("authorize").onclick = () => {
  const origin = courtOrigin(activeTab?.url || ""); if (!origin) return;
  // Request from this user gesture, before unrelated asynchronous work.
  const permission = chrome.permissions.request({ origins: [`${origin}/*`] });
  void run(async () => { if (!await permission) throw new Error("Tribunal não autorizado."); await send({ type: "ADD_ORIGIN", origin }); await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ["content.js"] }); await refresh(); el("status").textContent = "Detecção autorizada. Aguarde a leitura dos números visíveis e use Sincronizar fila agora, ou ligue o envio automático."; });
};
el("disconnect").onclick = () => run(async () => { if (!window.confirm("Desconectar este escritório e apagar a fila local ainda não enviada?")) return; await send({ type: "DISCONNECT" }); await refresh(); });
void run(async () => { [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true }); el("current").textContent = courtOrigin(activeTab?.url || "") || "Abra uma página HTTPS do PJe (.jus.br) para autorizar a detecção."; await refresh(); });
