/**
 * Dados FICTÍCIOS para demonstrar o LegalOS Comercial (nomes inventados, sem CNPJ real).
 * Uso: DATABASE_URL=postgresql://.../legalos_demo npx tsx scripts/demo-seed-comercial.ts <email-do-usuario-admin>
 */
import { db } from "../src/lib/db/client";
import { ensureDefaultAddons } from "../src/server/services/comercial.service";

const email = process.argv[2];
if (!email) throw new Error("Informe o e-mail do usuário que será administrador da plataforma (demo).");

const ROWS: [string, string, string, number, number, string, number | null, number | null, string][] = [
  ["Almeida Prado Advogados", "Bela Vista", "Avenida Paulista", -23.5614, -46.6559, "PROPOSTA", 1, 89000, "Ranking de exemplo"],
  ["Barros & Cavalcanti Advocacia", "Itaim Bibi", "Rua Joaquim Floriano", -23.5844, -46.678, "NEGOCIACAO", 2, 120000, "Ranking de exemplo"],
  ["Cardoso Lima Sociedade de Advogados", "Vila Olímpia", "Rua Funchal", -23.5953, -46.6858, "DEMONSTRACAO", 3, 99000, "Ranking de exemplo"],
  ["Duarte Nogueira Advogados", "Centro", "Rua Direita", -23.5505, -46.6333, "CONTATO", 4, 69000, "Ranking de exemplo"],
  ["Esteves & Moraes Advocacia", "Pinheiros", "Rua dos Pinheiros", -23.5614, -46.6918, "QUALIFICADO", 5, null, "Ranking de exemplo"],
  ["Fontes Ribeiro Advogados", "Moema", "Avenida Ibirapuera", -23.6008, -46.665, "IDENTIFICADO", 6, null, "Ranking de exemplo"],
  ["Gouveia Tavares Advocacia", "Brooklin", "Avenida Berrini", -23.6141, -46.6969, "GANHO", 7, 79000, "Ranking de exemplo"],
  ["Henriques Salles Advogados", "Santana", "Avenida Cruzeiro do Sul", -23.5017, -46.6256, "PERDIDO", 8, 59000, "Ranking de exemplo"],
  ["Ibrahim Campos Sociedade de Advogados", "Tatuapé", "Rua Tuiuti", -23.5405, -46.5766, "CONTATO", 9, 65000, "Ranking de exemplo"],
  ["Junqueira Azevedo Advogados", "Consolação", "Rua da Consolação", -23.5553, -46.6602, "IDENTIFICADO", 10, null, "Ranking de exemplo"],
  ["Klein Pacheco Advocacia", "Jardins", "Alameda Santos", -23.57, -46.6633, "QUALIFICADO", 11, 72000, "Ranking de exemplo"],
  ["Leal Monteiro Advogados", "Faria Lima", "Avenida Brigadeiro Faria Lima", -23.5868, -46.6825, "PROPOSTA", 12, 149000, "Ranking de exemplo"],
];

async function main() {
  const user = await db.user.findFirstOrThrow({ where: { email } });
  await db.platformAdmin.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
  await db.userMfa.upsert({ where: { userId: user.id }, create: { userId: user.id, secretEnc: "demo", enabledAt: new Date() }, update: { enabledAt: new Date() } });
  await ensureDefaultAddons();
  await db.comAddon.update({ where: { key: "rute" }, data: { priceCents: 19900 } });
  await db.comAddon.update({ where: { key: "assinatura" }, data: { priceCents: 9900 } });
  await db.comProspect.deleteMany({ where: { rankingSource: "Ranking de exemplo" } });
  for (const [name, district, street, lat, lng, stage, rank, monthly, src] of ROWS) {
    const won = stage === "GANHO";
    await db.comProspect.create({
      data: {
        name, district, street, lat, lng, city: "São Paulo", state: "SP", stage: stage as never, rankingPosition: rank, rankingSource: src, expectedMonthlyCents: monthly,
        wonMonthlyCents: won ? monthly : null, wonAt: won ? new Date() : null, lostReason: stage === "PERDIDO" ? "Já usa outro sistema" : null, ownerId: user.id,
        phone: `(11) 3${String(100 + rank!).padStart(3, "0")}-${String(1000 + rank! * 37).slice(0, 4)}`, geocodedAt: new Date(), geocodeNote: "Dado de exemplo",
        nextActionAt: ["CONTATO", "PROPOSTA", "NEGOCIACAO", "DEMONSTRACAO"].includes(stage) ? new Date(Date.now() + ((rank! % 5) - 2) * 86_400_000) : null,
        nextActionNote: "Retornar sobre a proposta", areas: ["Cível", "Trabalhista"], tags: ["exemplo"],
      },
    });
  }
  console.log("ok: 12 escritórios de exemplo e", email, "como administrador da plataforma (demo).");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
