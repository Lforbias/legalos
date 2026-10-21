/*
 * Service worker do LegalOS.
 * REGRA DE SEGURANÇA: dados de clientes e processos NUNCA são guardados no aparelho por este arquivo.
 *  - Páginas (navegação) e /api: sempre da rede. Sem rede → mostra /offline.html (uma tela genérica, sem dados).
 *  - Somente arquivos estáticos versionados (/_next/static, /pwa) ficam em cache, para abrir o app mais rápido.
 */
const VERSION = "v2";
const STATIC_CACHE = `legalos-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/pwa/icon-192.png", "/pwa/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("legalos-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: rede primeiro; offline → tela genérica.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Estáticos versionados: cache primeiro.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Todo o resto (inclui /api e dados): não interceptado.
});

// Avisos no celular (push). O texto vem genérico do servidor (contagens); nada de dados de clientes é guardado aqui.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "LegalOS";
  const body = typeof data.body === "string" ? data.body.slice(0, 160) : "";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa/icon-192.png",
      badge: "/pwa/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag.slice(0, 40) : "legalos",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c && c.url.startsWith(self.location.origin)) {
          if ("navigate" in c) return c.navigate(target).then((w) => (w || c).focus());
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
