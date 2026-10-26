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

// Aplica o tema salvo antes da primeira pintura e acompanha mudanças do sistema sem recarregar.
const themeScript = `(function(){try{var media=window.matchMedia('(prefers-color-scheme: light)');function apply(){var preference=localStorage.getItem('lo-theme')||'dark';var theme=preference==='system'?(media.matches?'light':'dark'):(preference==='light'?'light':'dark');document.documentElement.setAttribute('data-theme',theme);var color=document.querySelector('meta[name="theme-color"]');if(color)color.setAttribute('content',theme==='light'?'#F5F7FA':'#0A0C13')}apply();var onChange=function(){if((localStorage.getItem('lo-theme')||'dark')==='system')apply()};if(media.addEventListener)media.addEventListener('change',onChange);else if(media.addListener)media.addListener(onChange)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

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
