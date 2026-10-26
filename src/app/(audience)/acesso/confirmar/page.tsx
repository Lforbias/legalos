import type { Metadata } from "next";
import { Action } from "../../_forms";
export const metadata: Metadata = {
  title: "Confirmar acesso",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="aud-wrap aud-content">
      <div className="aud-card" style={{ maxWidth: 520, margin: "30px auto" }}>
        <h1 style={{ fontSize: 30 }}>Confirme seu acesso</h1>
        <p>
          Este link funciona uma vez, por 15 minutos, no navegador em que você
          pediu para entrar.
        </p>
        <Action path="auth/confirm" data={{ token }} primary>
          Entrar na conta gratuita
        </Action>
      </div>
    </div>
  );
}
