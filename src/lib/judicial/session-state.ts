/**
 * Box 3.0 — estado de sessão/credencial do conector autenticado (PJe/eproc/e-SAJ/PROJUDI), no vocabulário pedido
 * pelo prompt mestre para o "JudicialSessionManager": not_configured / configuration_required / authenticating /
 * human_action_required / authenticated / expired / degraded / error.
 *
 * Isto é SÓ uma leitura derivada (funções puras, sem banco, sem rede, sem segredo) dos campos que já existem em
 * `CourtConnection` (MNI/SOAP) e `PortalAccess` (robô Playwright do portal web). Não cria sessão nenhuma, não abre
 * segredo nenhum, não chama nenhum conector, e não muda em nada o retraimento do Box autenticado: BOX_AVAILABLE
 * continua falso e nenhuma função deste arquivo remove ou contorna `assertBoxAvailable()`. O objetivo é só dar um
 * nome único e honesto ao estado disperso em `lastStatus`/`wsdlStatus`/`status` hoje, para a previa do Box 3.0 (ou
 * qualquer tela futura) descrever a conexão sem inventar um "conectado" que a evidência não sustenta.
 *
 * Duas arquiteturas diferentes, dois mapeamentos diferentes:
 *  - MNI/SOAP (`CourtConnection`) não mantém sessão viva entre chamadas: a credencial (senha e/ou certificado A1)
 *    vai dentro de cada envelope SOAP. "authenticated" aqui significa "a última consulta/contrato verificado deu
 *    certo", não "há uma sessão aberta agora" — não existe sessão para proteger de cópia indevida para a nuvem.
 *  - O robô do portal web (`PortalAccess`, Playwright) também reautentica do zero a cada trabalho (não guarda
 *    cookie entre execuções nesta arquitetura); "authenticated" aqui tem o mesmo sentido de "última tentativa
 *    de login bem-sucedida", não uma sessão de navegador persistente. Se uma arquitetura futura (ex.: um agente
 *    local tipo "LegalOS Box Companion") vier a manter sessão viva, a regra de nunca copiar essa sessão para a
 *    nuvem sem autorização e revisão de segurança passa a valer de verdade e precisa ser revisada aqui.
 */

export type JudicialSessionState =
  | "not_configured"
  | "configuration_required"
  | "authenticating"
  | "human_action_required"
  | "authenticated"
  | "expired"
  | "degraded"
  | "error";

export const JUDICIAL_SESSION_STATE_LABEL: Record<JudicialSessionState, string> = {
  not_configured: "Não configurado",
  configuration_required: "Configuração pendente",
  authenticating: "Autenticando",
  human_action_required: "Precisa de ação humana",
  authenticated: "Última tentativa autenticada",
  expired: "Expirado",
  degraded: "Degradado (com falhas recentes)",
  error: "Erro",
};

export type CourtConnectionStateInput = {
  enabled: boolean;
  wsdlStatus: string | null;
  lastStatus: string | null;
};

/**
 * MNI/SOAP (`CourtConnection`). `wsdlStatus` prova só que o contrato publicado foi lido e tem o formato esperado
 * — nunca que o tribunal aceitou a credencial. `lastStatus` ("OK"/"ERROR"/"PENDING"/null) vem da última consulta
 * real (ou da última verificação de contrato, quando ainda não houve consulta).
 */
export function courtConnectionSessionState(c: CourtConnectionStateInput): JudicialSessionState {
  if (!c.wsdlStatus) return "configuration_required";
  if (c.wsdlStatus === "INCOMPATIBLE") return "error";
  if (!c.enabled) return "not_configured";
  if (c.lastStatus === "OK") return "authenticated";
  if (c.lastStatus === "ERROR") return "degraded";
  return "configuration_required";
}

export type PortalAccessStateInput = {
  enabled: boolean;
  status: string;
};

/** Robô do portal web (`PortalAccess`), estados definidos em `src/lib/robots/pje/outcome.ts`. */
export function portalAccessSessionState(p: PortalAccessStateInput): JudicialSessionState {
  if (!p.enabled) return "not_configured";
  switch (p.status) {
    case "PENDING":
      return "configuration_required";
    case "CONNECTING":
      return "authenticating";
    case "NEEDS_ACTION":
      return "human_action_required";
    case "CONNECTED":
      return "authenticated";
    case "ERROR":
      return "degraded";
    default:
      return "error";
  }
}
