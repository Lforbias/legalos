import { describe, expect, it } from "vitest";
import { findMentions } from "@/modules/tasks/mentions";

const members = [
  { id: "1", name: "Ana" },
  { id: "2", name: "Ana Paula Souza" },
  { id: "3", name: "João Carlos" },
];

describe("menções em comentários", () => {
  it("casa o nome inteiro e prefere o mais longo", () => {
    expect(findMentions("Pode revisar, @Ana Paula Souza?", members)).toEqual(["2"]);
    expect(findMentions("@Ana e @Ana Paula Souza", members).sort()).toEqual(["1", "2"]);
  });
  it("ignora maiúsculas, acentos de caixa e nomes colados em outras palavras", () => {
    expect(findMentions("oi @joão carlos!", members)).toEqual(["3"]);
    expect(findMentions("@Anabela chegou", members)).toEqual([]);
    expect(findMentions("email ana@example.com", members)).toEqual([]);
  });
  it("sem arroba não menciona", () => {
    expect(findMentions("Ana Paula Souza revisou", members)).toEqual([]);
  });
});
