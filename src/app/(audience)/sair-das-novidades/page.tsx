import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Sair das novidades",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; id?: string }>;
}) {
  const p = await searchParams;
  return (
    <div className="aud-wrap aud-content">
      <div className="aud-card">
        <h1 style={{ fontSize: 32 }}>Sair da lista de novidades</h1>
        <p>
          Você continuará com acesso à sua conta gratuita e receberá apenas
          e-mails necessários ao serviço.
        </p>
        <form action="/api/audience/unsubscribe" method="post">
          <input name="id" type="hidden" value={p.id ?? ""} />
          <input name="token" type="hidden" value={p.token ?? ""} />
          <button className="aud-btn primary">Confirmar descadastro</button>
        </form>
      </div>
    </div>
  );
}
