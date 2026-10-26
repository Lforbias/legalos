/** Names and photo order supplied by the user. No additional titles or biographies inferred. */
export const FOUNDERS = [
  { slug: "luiz-felipe-de-oliveira-roweder-bernardes", name: "Luiz Felipe de Oliveira Roweder Bernardes", role: "Co-founder", image: "/produto/co-founders/luiz-felipe.png", position: "50% 35%" },
  { slug: "talita-silva-de-brito", name: "Talita Silva de Brito", role: "Co-founder", image: "/produto/co-founders/talita-silva.png", position: "50% 50%" },
  { slug: "arthur-camilo-da-silva", name: "Arthur Camilo da Silva", role: "Co-founder", image: "/produto/co-founders/arthur-camilo.jpg", position: "50% 25%" },
] as const;

export function getFounder(slug: string) {
  return FOUNDERS.find(person => person.slug === slug);
}
