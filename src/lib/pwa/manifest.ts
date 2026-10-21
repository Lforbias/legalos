import { product } from "@/config/product";

/** Web App Manifest do LegalOS (instalável no celular e no computador). Dados puros para facilitar teste. */
export const PWA_THEME = "#0a0c13";

export const PWA_SHORTCUTS = [
  { name: "Prazos", short_name: "Prazos", url: "/prazos" },
  { name: "Agenda", short_name: "Agenda", url: "/agenda" },
  { name: "Caixa de entrada (intimações)", short_name: "Intimações", url: "/caixa-de-entrada" },
  { name: "Tarefas", short_name: "Tarefas", url: "/tarefas" },
] as const;

export function buildManifest() {
  return {
    id: "/",
    name: `${product.name} — gestão jurídica`,
    short_name: product.name,
    description: product.tagline,
    lang: "pt-BR",
    dir: "ltr" as const,
    start_url: "/?origem=app",
    scope: "/",
    display: "standalone" as const,
    orientation: "any" as const,
    background_color: PWA_THEME,
    theme_color: PWA_THEME,
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" as const },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" as const },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" as const },
    ],
    shortcuts: PWA_SHORTCUTS.map((s) => ({
      ...s,
      icons: [{ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
    })),
  };
}
