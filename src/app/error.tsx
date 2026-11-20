"use client";

import { ErrorState } from "@/components/layout/error-state";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState error={error} retry={retry} homeHref="/" />;
}
