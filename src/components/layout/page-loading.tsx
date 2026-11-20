/** Esqueleto de carregamento do painel. Só em seções SEM notFound() abaixo: com loading.tsx a resposta começa antes e um 404 sairia como 200. */
export function PageLoading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-5xl animate-pulse space-y-4 py-2">
      <span className="sr-only">Carregando…</span>
      <div className="h-7 w-1/3 rounded-md bg-border/60" />
      <div className="h-4 w-1/2 rounded-md bg-border/40" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-lg bg-border/40" />
        <div className="h-24 rounded-lg bg-border/40" />
        <div className="h-24 rounded-lg bg-border/40" />
      </div>
      <div className="h-64 rounded-lg bg-border/30" />
    </div>
  );
}
