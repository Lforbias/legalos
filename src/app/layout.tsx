import type { Metadata, Viewport } from "next";
import "./globals.css";
import { product } from "@/config/product";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { THEME_SCRIPT } from "@/lib/theme-script";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
