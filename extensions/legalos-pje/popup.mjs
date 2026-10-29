/* global chrome */
import { courtOrigin } from "./common.mjs";
import { pjeOtpStep } from "./otp.mjs";
import { inspectTrf3Notices } from "./notices.mjs";
const el = id => document.getElementById(id);
let activeTab;
let otpChallenge;
let noticePreview;
function clearNotices() { noticePreview = null; el("notice-preview").replaceChildren(); el("notice-import").hidden = true; }
async function noticeState() { const state = await send({ type: "NOTICE_STATE" }); el("notice-office").textContent = state.office ? `Importar para: ${state.office}` : "Importação desconectada."; }
el("notice-connection").onsubmit = event => { event.preventDefault(); const token = el("notice-token").value.trim(); el("notice-token").value = ""; clearNotices(); void run(async () => { await send({ type: "NOTICE_CONNECT", token }); await noticeState(); }); };
el("notice-inspect").onclick = () => run(async () => {
  clearNotices();
  const state = await send({ type: "NOTICE_STATE" });
  if (!state.office) throw new Error("Conecte primeiro a importação para conferir o escritório de destino.");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "ISOLATED", func: inspectTrf3Notices });
  const found = result?.result; el("notice-status").textContent = found?.message || "Não foi possível ler a lista.";
  if (!found?.ok) return;
  noticePreview = { batch: { sourceOrigin: found.sourceOrigin, sourcePath: found.sourcePath, items: found.items, confirmed: true }, tabId: tab.id, documentId: result.documentId, office: state.office, binding: state.binding, expires: Date.now() + 120000 };
  for (const item of found.items) { const li = document.createElement("li"); li.textContent = `${item.caseNumber} · ${item.title} (${item.reference}) · ${item.communicatedAt}`; el("notice-preview").append(li); }
  el("notice-import").hidden = false;
});
el("notice-import").onclick = () => run(async () => {
  const preview = noticePreview; clearNotices();
  if (!preview || Date.now() > preview.expires) throw new Error("Conferência expirada. Leia novamente a lista.");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const state = await send({ type: "NOTICE_STATE" });
  if (tab.id !== preview.tabId || state.binding !== preview.binding) throw new Error("A aba ou a conexão mudou. Confira novamente.");
  const [current] = await chrome.scripting.executeScript({ target: { tabId: tab.id, documentIds: [preview.documentId] }, world: "ISOLATED", func: inspectTrf3Notices });
  if (!current?.result?.ok || JSON.stringify(current.result.items) !== JSON.stringify(preview.batch.items)) throw new Error("A lista mudou. Confira novamente antes de importar.");
  const result = await send({ type: "NOTICE_IMPORT", binding: preview.binding, batch: preview.batch });
  el("notice-status").textContent = `${result.created} novo(s), ${result.known} já conhecido(s). Abra a Caixa de entrada do LegalOS para conferir.`;
});
el("notice-disconnect").onclick = () => run(async () => { clearNotices(); await send({ type: "NOTICE_DISCONNECT" }); await noticeState(); });
void noticeState().catch(() => {});
function clearOtp() { otpChallenge = null; el("otp-code").value = ""; el("otp-form").hidden = true; }
el("otp-inspect").onclick = () => run(async () => {
  clearOtp();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "ISOLATED", func: pjeOtpStep });
  const state = result?.result;
  el("otp-status").textContent = state?.message || "Não foi possível verificar o desafio desta aba.";
  if (state?.ok && state.ticket && result.documentId) {
    otpChallenge = { tabId: tab.id, documentId: result.documentId, ticket: state.ticket, expiresAt: state.expiresAt };
    el("otp-form").hidden = false; el("otp-code").focus();
  }
});
el("otp-form").onsubmit = event => {
  event.preventDefault(); const challenge = otpChallenge; const code = el("otp-code").value.trim(); clearOtp();
  void run(async () => {
    if (!challenge || Date.now() > challenge.expiresAt) throw new Error("Solicitação expirada. Verifique o login novamente.");
    if (!/^\d{6}$/.test(code)) throw new Error("Informe exatamente 6 dígitos.");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id !== challenge.tabId) throw new Error("A aba mudou. Nenhum código foi enviado.");
    const [result] = await chrome.scripting.executeScript({ target: { tabId: challenge.tabId, documentIds: [challenge.documentId] }, world: "ISOLATED", func: pjeOtpStep, args: ["submit", code, challenge.ticket] });
    el("otp-status").textContent = result?.result?.message || "Confira o resultado diretamente no PJe. Não reenvie o mesmo código.";
  });
};
window.addEventListener("pagehide", clearOtp);
setInterval(() => { if (otpChallenge && Date.now() > otpChallenge.expiresAt) { clearOtp(); el("otp-status").textContent = "Solicitação expirada. Verifique o login novamente."; } }, 1000);
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
