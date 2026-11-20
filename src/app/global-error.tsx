"use client";

/** Último recurso: falha no layout raiz. Renderiza o próprio documento, sem o CSS do app. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0c13", color: "#e7e9f0", fontFamily: "system-ui, sans-serif" }}>
        <title>Erro · LegalOS</title>
        <div role="alert" style={{ maxWidth: 440, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>O LegalOS encontrou um erro</h1>
          <p style={{ fontSize: 14, opacity: 0.75 }}>Tente de novo em instantes. Se continuar, avise o suporte{digest ? ` informando o código ${digest}` : ""}.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: 0, background: "#4f6bff", color: "#fff", cursor: "pointer" }}>Tentar de novo</button>
        </div>
      </body>
    </html>
  );
}
