/* global chrome */
(() => {
  if (window.__legalosPjeObserver) { window.dispatchEvent(new Event("legalos-pje-rescan")); return; }
  window.__legalosPjeObserver = true;
  const seen = new Set();
  let timer;
  let busy = false;
  async function collect() {
    if (busy || document.hidden || !document.body || document.querySelector('input[type="password"]')) return;
    // Read visible text only; never input values, cookies, storage, requests or documents.
    const text = (document.body.innerText || "").slice(0, 250000);
    const numbers = [...new Set(text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) || [])].filter(n => !seen.has(n)).slice(0, 50);
    if (!numbers.length) return;
    busy = true;
    try { const res = await chrome.runtime.sendMessage({ type: "CAPTURE", numbers }); if (res?.ok) for (const n of numbers) seen.add(n); } catch { /* Disconnected extension: leave observations available for next scan. */ }
    finally { busy = false; }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(collect, 1200); };
  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener("legalos-pje-rescan", () => { seen.clear(); schedule(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  schedule();
})();
