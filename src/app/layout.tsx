import type { Metadata, Viewport } from "next";
import "./globals.css";
import { product } from "@/config/product";
import { PwaRegister } from "@/components/pwa/pwa-register";

// CSP com nonce exige renderização dinâmica (páginas estáticas não recebem o nonce).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: product.name, template: `%s · ${product.name}` },
  description: product.tagline,
  robots: { index: false, follow: false },
  applicationName: product.name,
  icons: { apple: "/pwa/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: product.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [{ color: "#0a0c13" }],
  width: "device-width",
  initialScale: 1,
};

// Aplica o tema salvo antes da primeira pintura (evita flash). Padrão: dark.
const themeScript = `(function(){try{var t=localStorage.getItem('lo-theme')||'dark';if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
