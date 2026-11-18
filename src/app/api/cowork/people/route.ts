import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http";
import { coworkRouteContext, NO_STORE } from "@/server/cowork/route-auth";
import { listCoworkPeople } from "@/server/services/cowork-access.service";
import { computeWorkStates } from "@/server/services/cowork-insights.service";

export const dynamic = "force-dynamic";

/** Diretório do Cowork com o estado de trabalho (derivado de tarefas, agenda e reuniões; nunca de presença online). */
export async function GET() {
  try {
    const auth = await coworkRouteContext();
    if ("error" in auth) return auth.error;
    const people = await listCoworkPeople(auth.ctx);
    const states = await computeWorkStates(auth.ctx, people.map((p) => p.id));
    return NextResponse.json({ people: people.map((p) => ({ ...p, workState: states.get(p.id) ?? "NOT_INFORMED" })) }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
