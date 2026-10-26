import Link from "next/link";
import { requirePlatform } from "@/server/platform";
import { sql, settings, type Post } from "@/server/audience/store";
import { categories } from "@/lib/audience/policy";
import { manage } from "./actions";
import "../../(audience)/audience.css";
export const dynamic = "force-dynamic";
export default async function Editorial({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; editar?: string }>;
}) {
  await requirePlatform();
  const params = await searchParams,
    s = await settings();
  const [posts, queue, reports, counts, members] = await Promise.all([
    sql<Post>(
      "SELECT * FROM audience_posts ORDER BY created_at DESC LIMIT 100",
    ),
    sql<{
      id: string;
      body: string;
      title: string;
      kind: string;
      status: string;
    }>(
      `SELECT id,body,title,'audience_questions' kind,status FROM audience_questions WHERE status='pending' UNION ALL SELECT id,body,'Resposta','audience_replies',status FROM audience_replies WHERE status='pending' UNION ALL SELECT id,body,'Comentário','audience_comments',status FROM audience_comments WHERE status='pending' LIMIT 100`,
    ),
    sql<{ id: string; target_id: string; reason: string; created_at: Date }>(
      "SELECT * FROM audience_reports WHERE resolved_at IS NULL ORDER BY created_at LIMIT 100",
    ),
    sql<{ origin: string; kind: string; n: number }>(
      "SELECT origin,kind,count(*)::int n FROM audience_events GROUP BY origin,kind",
    ),
    sql<{
      id: string;
      name: string;
      email: string;
      origin: string;
      marketing: boolean;
      invited: boolean;
      blocked: boolean;
      converted_at: Date | null;
    }>("SELECT * FROM audience_members ORDER BY created_at DESC LIMIT 50"),
  ]);
  const sources = await sql<{
    id: string;
    name: string;
    url: string;
    last_error: string;
    last_checked_at: Date | null;
  }>("SELECT * FROM audience_sources ORDER BY name");
  const snapshots = await sql<{
    id: string;
    name: string;
    body: string;
    fetched_at: Date;
  }>(
    `SELECT p.*,s.name FROM audience_source_snapshots p JOIN audience_sources s ON s.id=p.source_id WHERE p.draft_id IS NULL ORDER BY p.fetched_at DESC LIMIT 20`,
  );
  const edit = posts.find((p) => p.id === params.editar);
  const field = (name: string, label: string, value = "", type = "text") => (
    <label>
      {label}
      <input
        className="aud-input"
        type={type}
        name={name}
        defaultValue={value}
        required
      />
    </label>
  );
  return (
    <div className="audience" style={{ padding: 24, borderRadius: 16 }}>
      <span className="aud-tag">Plataforma · Conteúdo e audiência</span>
      <h1 style={{ fontSize: 32 }}>Blog, ferramentas e comunidade</h1>
      <p>
        Publicação e moderação exigem revisão humana. A conta pública não
        concede acesso aos escritórios.
      </p>
      {params.erro && (
        <p role="alert" className="aud-feedback error">
          {params.erro}
        </p>
      )}
      {params.ok && (
        <p role="status" className="aud-feedback">
          Alteração salva.
        </p>
      )}
      <div className="aud-card">
        <h2 style={{ marginTop: 0 }}>Liberação de lançamento</h2>
        <form action={manage}>
          <input type="hidden" name="action" value="settings" />
          <div className="aud-columns">
            {field("reviewer", "Responsável pela revisão jurídica", s.reviewer)}
            {field("moderator", "Responsável pela moderação", s.moderator)}
          </div>
          <label className="aud-check">
            <input
              type="checkbox"
              name="legal"
              defaultChecked={s.legal_approved}
            />
            Confirmo que os termos, a privacidade e as regras foram revisados e
            aprovados pela assessoria jurídica.
          </label>
          <label className="aud-check">
            <input
              type="checkbox"
              name="blog"
              defaultChecked={s.blog_enabled}
            />
            Liberar publicações aprovadas do blog
          </label>
          <label className="aud-check">
            <input
              type="checkbox"
              name="community"
              defaultChecked={s.community_enabled}
            />
            Abrir comunidade para membros convidados
          </label>
          <button className="aud-btn primary">Salvar configuração</button>
        </form>
      </div>
      <div className="aud-card">
        <h2 style={{ marginTop: 0 }}>Origem e conversão</h2>
        <div className="aud-scroll">
          <table>
            <thead>
              <tr>
                <th>Origem</th>
                <th>Evento</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.origin + c.kind}>
                  <td>{c.origin}</td>
                  <td>{c.kind}</td>
                  <td>{c.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="aud-muted">
          Cadastros não geram autorização comercial. Pedidos explícitos de
          demonstração entram no Comercial com a etiqueta da origem.
        </p>
        <Link href="/admin/comercial" className="aud-link">
          Abrir Comercial →
        </Link>
      </div>
      <div className="aud-card">
        <h2 style={{ marginTop: 0 }}>Fontes oficiais e rascunhos assistidos</h2>
        <p className="aud-muted">
          A rotina guarda mudanças nas páginas oficiais cadastradas. A IA apenas
          prepara rascunhos; nenhuma publicação é automática.
        </p>
        <form action={manage}>
          <input type="hidden" name="action" value="source" />
          {field("name", "Nome da fonte")}
          {field("url", "Página específica oficial HTTPS", "", "url")}
          <label>
            Área
            <select className="aud-input" name="category">
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button className="aud-btn">Cadastrar fonte</button>
        </form>
        {sources.map((s) => (
          <div className="aud-listlink" key={s.id}>
            <h3>{s.name}</h3>
            <p className="aud-muted">
              {s.url} ·{" "}
              {s.last_checked_at
                ? new Date(s.last_checked_at).toLocaleString("pt-BR")
                : "Ainda não consultada"}
              {s.last_error ? " · " + s.last_error : ""}
            </p>
            <form action={manage}>
              <input name="action" type="hidden" value="capture" />
              <input name="id" type="hidden" value={s.id} />
              <button className="aud-btn">Consultar agora</button>
            </form>
          </div>
        ))}
        {snapshots.map((s) => (
          <details key={s.id} className="aud-listlink">
            <summary>{s.name} · Texto capturado</summary>
            <p className="aud-prose">{s.body}</p>
            <form action={manage}>
              <input name="action" type="hidden" value="generate" />
              <input name="id" type="hidden" value={s.id} />
              {field(
                "source_date",
                "Data de publicação do documento oficial (confira na fonte)",
                "",
                "date",
              )}
              <button className="aud-btn primary">Gerar rascunho com IA</button>
            </form>
          </details>
        ))}
      </div>
      <div className="aud-card">
        <h2 style={{ marginTop: 0 }}>
          {edit ? "Editar post e devolver à revisão" : "Novo rascunho"}
        </h2>
        <form action={manage}>
          <input name="action" type="hidden" value="draft" />
          {edit && <input name="id" type="hidden" value={edit.id} />}
          <div className="aud-columns">
            {field("slug", "Endereço (ex.: nova-regra-cnj)", edit?.slug)}
            {field("title", "Título com assunto e data", edit?.title)}
          </div>
          <label>
            Área
            <select
              className="aud-input"
              name="category"
              defaultValue={edit?.category}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {[
            ["summary", "Resumo em 3 linhas"],
            ["practical", "O que muda na prática"],
            ["applies", "Para quem e desde quando"],
          ].map(([k, l]) => (
            <label key={k}>
              {l}
              <textarea
                name={k}
                required
                className="aud-input"
                rows={k === "practical" ? 7 : 3}
                defaultValue={(edit?.[k as keyof Post] as string) ?? ""}
              />
            </label>
          ))}
          <div className="aud-columns">
            {field(
              "source_url",
              "Link oficial HTTPS (.gov.br ou .jus.br)",
              edit?.source_url,
              "url",
            )}
            {field(
              "source_name",
              "Nome do documento / órgão",
              edit?.source_name,
            )}
            {field(
              "source_date",
              "Data da fonte",
              edit?.source_date
                ? new Date(edit.source_date).toISOString().slice(0, 10)
                : "",
              "date",
            )}
            {field(
              "accessed_at",
              "Data de acesso à fonte",
              edit?.accessed_at
                ? new Date(edit.accessed_at).toISOString().slice(0, 10)
                : "",
              "date",
            )}
          </div>
          <label>
            Ferramenta relacionada
            <select className="aud-input" name="tool" defaultValue={edit?.tool}>
              <option value="prazos">Prazos</option>
              <option value="rescisao">Rescisão</option>
            </select>
          </label>
          <label>
            Correção / histórico da alteração
            <textarea
              name="correction"
              className="aud-input"
              rows={3}
              defaultValue={edit?.correction ?? ""}
            />
          </label>
          <button className="aud-btn primary">Salvar como rascunho</button>
        </form>
      </div>
      <div className="aud-card">
        <h2 style={{ marginTop: 0 }}>Publicações</h2>
        {!posts.length && <p>Nenhum rascunho cadastrado.</p>}
        {posts.map((p) => (
          <article
            key={p.id}
            style={{ borderTop: "1px solid #ddd", padding: "20px 0" }}
          >
            <h3>{p.title}</h3>
            <span className="aud-tag">{p.status}</span>{" "}
            <Link href={"/admin/conteudo?editar=" + p.id} className="aud-link">
              Editar
            </Link>
            {p.status === "published" && (
              <Link className="aud-link" href={"/blog/" + p.slug}>
                {" "}
                · Abrir post
              </Link>
            )}
            <p className="aud-muted">{p.summary}</p>
            {p.status === "draft" && (
              <form action={manage}>
                <input type="hidden" name="action" value="publish" />
                <input type="hidden" name="id" value={p.id} />
                <label className="aud-check">
                  <input name="review" type="checkbox" required />
                  Fonte, vigência, números e prazos conferidos pelo responsável
                  jurídico
                </label>
                <label className="aud-check">
                  <input type="checkbox" name="urgent" />
                  Urgência: publicar além do limite de um post por dia
                </label>
                <button className="aud-btn primary">Aprovar e publicar</button>
              </form>
            )}
            <form action={manage} style={{ marginTop: 10 }}>
              <input type="hidden" name="action" value="archive" />
              <input type="hidden" name="id" value={p.id} />
              <button className="aud-btn">Arquivar</button>
            </form>
          </article>
        ))}
      </div>
      <div className="aud-card">
        <h2 style={{ marginTop: 0 }}>Fila de moderação</h2>
        {!queue.length && <p>Nenhum conteúdo aguardando.</p>}
        {queue.map((item) => (
          <article
            key={item.id}
            style={{ borderTop: "1px solid #ddd", padding: "20px 0" }}
          >
            <h3>{item.title}</h3>
            <p className="aud-prose">{item.body}</p>
            <form action={manage}>
              <input type="hidden" name="action" value="moderate" />
              <input type="hidden" name="table" value={item.kind} />
              <input type="hidden" name="id" value={item.id} />
              <button
                className="aud-btn primary"
                name="status"
                value="approved"
              >
                Aprovar
              </button>{" "}
              <button className="aud-btn" name="status" value="hidden">
                Remover
              </button>
            </form>
          </article>
        ))}
      </div>
      <div className="aud-card">
        <h2 style={{ marginTop: 0 }}>Denúncias</h2>
        {reports.map((r) => (
          <article key={r.id}>
            <p>{r.reason}</p>
            <p className="aud-muted">Conteúdo: {r.target_id}</p>
            <form action={manage}>
              <input type="hidden" name="action" value="moderate" />
              <input type="hidden" name="id" value={r.target_id} />
              <select className="aud-input" name="table">
                <option value="audience_questions">Pergunta</option>
                <option value="audience_replies">Resposta</option>
                <option value="audience_comments">Comentário</option>
              </select>
              <button className="aud-btn" name="status" value="hidden">
                Remover conteúdo
              </button>
            </form>
            <form action={manage}>
              <input type="hidden" name="action" value="resolve" />
              <input type="hidden" name="id" value={r.id} />
              <button className="aud-btn">
                Marcar denúncia como resolvida
              </button>
            </form>
            <hr className="aud-rule" />
          </article>
        ))}
        {!reports.length && <p>Nenhuma denúncia pendente.</p>}
      </div>
      <div className="aud-card">
        <h2 style={{ marginTop: 0 }}>Convidar para o piloto</h2>
        <form action={manage}>
          <input type="hidden" name="action" value="invite" />
          {field("email", "E-mail do convidado", "", "email")}
          <button className="aud-btn">Autorizar este e-mail</button>
          <p className="aud-muted">
            Não envia convite automaticamente. Compartilhe o link da comunidade
            com a pessoa autorizada.
          </p>
        </form>
        <h3>Membros recentes</h3>
        {members.map((m) => (
          <div key={m.id} className="aud-row aud-listlink">
            <p>
              {m.name} · {m.email}
              <br />
              <span className="aud-muted">
                {m.origin} · {m.invited ? "Convidado" : "Sem convite"} ·{" "}
                {m.marketing ? "Novidades aceitas" : "Sem marketing"}
                {m.converted_at ? " · Pediu demonstração" : ""}
              </span>
            </p>
            {!m.blocked ? (
              <form action={manage}>
                <input type="hidden" name="action" value="block" />
                <input type="hidden" name="id" value={m.id} />
                <button className="aud-btn">Bloquear conta</button>
              </form>
            ) : (
              <span className="aud-tag">Bloqueado</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
