import type { Metadata } from "next";
import { originSchema } from "@/lib/audience/policy";
import { AuthForm } from "../_forms";
export const metadata: Metadata = {
  title: "Conta gratuita — criar conta ou entrar",
  robots: { index: false, follow: false },
};
export default async function Access({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string; erro?: string }>;
}) {
  const s = await searchParams,
    origin = originSchema.safeParse(s.origem);
  return (
    <section className="aud-auth">
      <div className="aud-auth-intro">
        <div className="aud-eyebrow">Conta gratuita</div>
        <h1>Entre para usar as ferramentas e a comunidade</h1>
        <p className="aud-lead">
          Com a conta, você salva o resultado das calculadoras e acompanha suas
          perguntas.
        </p>
        <p>✓ Salvar o resultado das ferramentas em PDF</p>
        <p>✓ Perguntar e responder no piloto da comunidade</p>
        <p>✓ Comentar nos posts do blog</p>
        <p className="aud-muted" style={{ marginTop: 32, color: "#bec6d8" }}>
          Não compartilhe CPF, CNPJ nem número de processo. A conta não dá
          acesso ao sistema do escritório.
        </p>
      </div>
      <div className="aud-auth-form">
        <AuthForm
          origin={origin.success ? origin.data : "blog"}
          google={Boolean(
            process.env.AUDIENCE_GOOGLE_CLIENT_ID &&
            process.env.AUDIENCE_GOOGLE_CLIENT_SECRET,
          )}
          error={s.erro}
        />
      </div>
    </section>
  );
}
