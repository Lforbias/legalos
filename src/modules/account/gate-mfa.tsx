"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { MfaCard } from "./mfa-card";

/**
 * Ativação do 2FA na tela de bloqueio. Não redireciona sozinha quando o servidor passa a ver o 2FA ativo,
 * para que os códigos de recuperação (mostrados uma única vez) não sumam; só segue depois de "Já guardei".
 */
export function GateMfa({ available, initiallyEnabled, recoveryLeft }: { available: boolean; initiallyEnabled: boolean; recoveryLeft: number }) {
  const router = useRouter();
  React.useEffect(() => {
    if (initiallyEnabled) router.replace("/");
  }, [initiallyEnabled, router]);
  return <MfaCard available={available} enabled={false} recoveryLeft={recoveryLeft} afterCodesHref="/" />;
}
