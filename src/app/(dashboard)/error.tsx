"use client";

import { ErrorState } from "@/components/layout/error-state";

export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState error={error} retry={retry} />;
}
