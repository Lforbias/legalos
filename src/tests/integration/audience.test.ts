import { beforeAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mail = vi.hoisted(() => [] as { text: string }[]);
vi.mock("@/lib/mail/mailer", () => ({
  getMailer: () => ({ delivers: true }),
  sendMailSafe: async (m: { text: string }) => {
    mail.push(m);
    return { delivered: true };
  },
}));
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => jar.set(k, v),
    delete: (k: string) => jar.delete(k),
  }),
}));
import {
  sql,
  uid,
  settings,
  posts,
  question,
  type Member,
} from "@/server/audience/store";
import {
  viewer,
  requireViewer,
  logout,
  withdraw,
  begin,
  emailFinish,
  googleFinish,
} from "@/server/audience/auth";
import {
  createQuestion,
  createReply,
  mark,
  accept,
} from "@/server/audience/community";
import { hashToken } from "@/lib/security/tokens";
let A: Member, B: Member, qid: string;
beforeAll(async () => {
  for (const label of ["A", "B"]) {
    const id = uid();
    await sql(
      `INSERT INTO audience_members(id,email,name,origin,unsubscribe_hash,invited) VALUES($1::uuid,$2,$3,'comunidade',$4,true)`,
      id,
      label + "@audience.test",
      label,
      hashToken(uid()),
    );
    const m = (
      await sql<Member>("SELECT * FROM audience_members WHERE id=$1::uuid", id)
    )[0]!;
    if (label === "A") A = m;
    else B = m;
  }
});
describe("Public audience integration", () => {
  it("starts with publication and community disabled", async () => {
    const s = await settings();
    expect(s.blog_enabled || s.community_enabled || s.legal_approved).toBe(
      false,
    );
    await expect(requireViewer(true)).rejects.toThrow();
    expect(await posts()).toEqual([]);
  });
  it("public sessions cannot be confused with office sessions", async () => {
    jar.set("lo_session", "office-token");
    expect(await viewer()).toBeNull();
    await sql(
      `INSERT INTO audience_sessions(token_hash,member_id,expires_at) VALUES($1,$2::uuid,now()+interval '1 hour')`,
      hashToken("public-token"),
      A.id,
    );
    jar.set("legalos_audience", "public-token");
    expect((await viewer())?.id).toBe(A.id);
  });
  it("closed gate refuses even invited members until enabled", async () => {
    await expect(requireViewer(true)).rejects.toThrow("piloto");
    await sql(
      "UPDATE audience_settings SET legal_approved=true,community_enabled=true,reviewer='Revisora',moderator='Moderadora' WHERE id=1",
    );
    expect((await requireViewer(true)).id).toBe(A.id);
  });
  it("rejects sensitive data on the server before storage", async () => {
    await expect(
      createQuestion(A, {
        title: "Como contar este prazo?",
        body: "O processo é 0001234-56.2026.8.26.0100",
        category: "Civil",
      }),
    ).rejects.toThrow("número de processo");
  });
  it("questions start pending and are never exposed before moderation", async () => {
    await createQuestion(A, {
      title: "Como vocês organizam revisão de peças?",
      body: "Quero entender como uma equipe pequena pode organizar uma segunda revisão.",
      category: "Rotina do escritório",
    });
    qid = (
      await sql<{ id: string }>(
        "SELECT id FROM audience_questions WHERE member_id=$1::uuid",
        A.id,
      )
    )[0]!.id;
    expect(await question(qid)).toBeUndefined();
    await sql(
      "UPDATE audience_questions SET status='approved' WHERE id=$1::uuid",
      qid,
    );
    expect((await question(qid))?.title).toContain("revisão");
  });
  it("refuses replies to hidden questions", async () => {
    await sql(
      "UPDATE audience_questions SET status='hidden' WHERE id=$1::uuid",
      qid,
    );
    await expect(
      createReply(B, {
        id: qid,
        body: "Outra pessoa revisa o texto antes do envio.",
      }),
    ).rejects.toThrow("não disponível");
    await sql(
      "UPDATE audience_questions SET status='approved' WHERE id=$1::uuid",
      qid,
    );
  });
  it("votes are unique and toggle; self-voting is refused", async () => {
    await expect(mark(A, { id: qid, kind: "question_vote" })).rejects.toThrow(
      "própria",
    );
    await mark(B, { id: qid, kind: "question_vote" });
    expect((await question(qid))?.votes).toBe(1);
    await mark(B, { id: qid, kind: "question_vote" });
    expect((await question(qid))?.votes).toBe(0);
  });
  it("only question author accepts an approved answer", async () => {
    await createReply(B, {
      id: qid,
      body: "Uma pessoa revisa a fonte e outra revisa o texto final.",
    });
    const id = (
      await sql<{ id: string }>(
        "SELECT id FROM audience_replies WHERE question_id=$1::uuid",
        qid,
      )
    )[0]!.id;
    await expect(accept(A, { id })).rejects.toThrow("aprovada");
    await sql(
      "UPDATE audience_replies SET status='approved' WHERE id=$1::uuid",
      id,
    );
    await expect(accept(B, { id })).rejects.toThrow("quem perguntou");
    await accept(A, { id });
    expect(
      (
        await sql<{ accepted: boolean }>(
          "SELECT accepted FROM audience_replies WHERE id=$1::uuid",
          id,
        )
      )[0]?.accepted,
    ).toBe(true);
  });
  it("withdrawal is immediate and preserves the account and proof", async () => {
    await sql(
      "UPDATE audience_members SET marketing=true WHERE id=$1::uuid",
      A.id,
    );
    await withdraw(A);
    expect(
      (
        await sql<{ marketing: boolean }>(
          "SELECT marketing FROM audience_members WHERE id=$1::uuid",
          A.id,
        )
      )[0]?.marketing,
    ).toBe(false);
    expect(
      (
        await sql(
          "SELECT * FROM audience_consents WHERE member_id=$1::uuid AND kind='withdrawal'",
          A.id,
        )
      ).length,
    ).toBe(1);
    expect((await viewer())?.id).toBe(A.id);
  });
  it("a blocked account loses public access", async () => {
    await sql(
      "UPDATE audience_members SET blocked=true WHERE id=$1::uuid",
      A.id,
    );
    expect(await viewer()).toBeNull();
    await sql(
      "UPDATE audience_members SET blocked=false WHERE id=$1::uuid",
      A.id,
    );
  });
  it("logout revokes token rather than only clearing the cookie", async () => {
    await logout();
    expect(await viewer()).toBeNull();
    jar.set("legalos_audience", "public-token");
    expect(await viewer()).toBeNull();
  });
  it("magic links record exact consent, are browser-bound, and cannot be replayed", async () => {
    await begin({
      email: "verified@audience.test",
      name: "Pessoa Verificada",
      origin: "ferramenta",
      marketing: false,
    });
    const token = new URL(
      mail
        .at(-1)!
        .text.match(
          /http:\/\/localhost:3000\/acesso\/confirmar\?token=[^\s]+/,
        )![0],
    ).searchParams.get("token")!;
    const cookie = jar.get("legalos_audience_auth")!;
    jar.delete("legalos_audience_auth");
    await expect(emailFinish(token)).rejects.toThrow("navegador");
    jar.set("legalos_audience_auth", cookie);
    expect(await emailFinish(token)).toBe("/ferramentas");
    const m = (await viewer())!;
    expect(m.marketing).toBe(false);
    expect(m.origin).toBe("ferramenta");
    const proof = await sql<{ kind: string; text: string; version: string }>(
      "SELECT kind,text,version FROM audience_consents WHERE member_id=$1::uuid",
      m.id,
    );
    expect(proof).toHaveLength(1);
    expect(proof[0]!.kind).toBe("terms");
    expect(proof[0]!.text).toContain("Termos de uso");
    jar.set("legalos_audience_auth", cookie);
    await expect(emailFinish(token)).rejects.toThrow("utilizado");
  });
  it("Google requires verified email, exchanges PKCE server-side and records optional marketing separately", async () => {
    process.env.AUDIENCE_GOOGLE_CLIENT_ID = "test-client";
    process.env.AUDIENCE_GOOGLE_CLIENT_SECRET = "test-secret";
    const r = await begin({ origin: "blog", marketing: true }, true);
    const url = new URL(r.url!);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    const fetched = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "test-only-token" }))
      .mockResolvedValueOnce(
        Response.json({
          sub: "google-test-sub",
          email: "google@audience.test",
          name: "Google Person",
          email_verified: true,
        }),
      );
    vi.stubGlobal("fetch", fetched);
    try {
      expect(
        await googleFinish(url.searchParams.get("state")!, "test-code"),
      ).toBe("/blog");
      expect(String(fetched.mock.calls[0]?.[1]?.body)).toContain(
        "code_verifier=",
      );
      const m = (await viewer())!;
      expect(m.marketing).toBe(true);
      expect(
        (
          await sql(
            "SELECT kind FROM audience_consents WHERE member_id=$1::uuid",
            m.id,
          )
        ).length,
      ).toBe(2);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.AUDIENCE_GOOGLE_CLIENT_ID;
      delete process.env.AUDIENCE_GOOGLE_CLIENT_SECRET;
    }
  });
});
