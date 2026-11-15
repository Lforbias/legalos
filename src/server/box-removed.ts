export async function boxRemovedResponse(..._args: unknown[]): Promise<Response> {
  return Response.json({ error: "box_removed", message: "Este recurso judicial foi removido do LegalOS." }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
