import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SendToClient, type SendTarget } from "./send-to-client";

/** Cartão "Falar com o cliente" (processo e ficha do cliente). Só aparece se houver a quem enviar. */
export function SendClientCard({ targets, source, caseId }: { targets: SendTarget[]; source: "case" | "client"; caseId?: string }) {
  if (targets.length === 0) return null;
  return (
    <Card data-testid="send-client-card">
      <CardHeader title="Falar com o cliente" description="Mensagem pelo WhatsApp do escritório, com revisão antes de enviar." />
      <CardBody className="space-y-3">
        {targets.map((t) => <SendToClient key={t.clientId} target={t} source={source} caseId={caseId} />)}
      </CardBody>
    </Card>
  );
}
