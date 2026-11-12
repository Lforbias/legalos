import { MfaCard } from "./mfa-card";

export function GateMfa({ available, initiallyEnabled, recoveryLeft }: { available: boolean; initiallyEnabled: boolean; recoveryLeft: number }) {
  return <MfaCard available={available} enabled={initiallyEnabled} recoveryLeft={recoveryLeft} afterCodesHref="/dashboard" />;
}
