import { describe, expect, it } from "vitest";
import { noticeDisplayText } from "@/lib/notices/display";

describe("leitura de publicações importadas", () => {
  it("exibe quebras, destaques e entidades sem alterar o texto original", () => {
    const raw = 'Publicação<br/>Parte: <span class="highlight">MARIA</span><br>Prazo de 15 dias &amp; ciência &#231; &#xE3;.';
    expect(noticeDisplayText(raw)).toBe("Publicação\nParte: MARIA\nPrazo de 15 dias & ciência ç ã.");
    expect(raw).toContain('<span class="highlight">');
  });

  it("preserva palavras com destaque dentro delas", () => {
    expect(noticeDisplayText("Intim<strong>ação</strong> recebida")).toBe("Intimação recebida");
  });

  it("remove conteúdo de script/style e mantém HTML escapado como texto", () => {
    expect(noticeDisplayText('<p>Intime-se.</p><script>alert(1)</script><style>body{}</style>&lt;img src=x onerror=alert(1)&gt;'))
      .toBe("Intime-se.\n<img src=x onerror=alert(1)>");
  });

  it("preserva comparações, placeholders e entidades numéricas inválidas", () => {
    expect(noticeDisplayText("Valor < 500; <nome da parte>\n&#99999999; &#xD800;"))
      .toBe("Valor < 500; <nome da parte>\n&#99999999; &#xD800;");
  });
});
