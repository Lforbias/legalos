import { redirect } from "next/navigation";
import { requirePlatform } from "@/server/platform";

// Junção com o LegalOS Comercial (8.0): o painel real fica em /comercial. O mapa/base da Receita continua em /admin/comercial/prospeccao.
export default async function CommercialRedirect() {
  await requirePlatform();
  redirect("/comercial");
}
