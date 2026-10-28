/** Mensagens fixas: nunca devolva a resposta bruta, URLs, credenciais ou conteúdo SOAP. */
export function mniHttpError(status: number, body: string): string {
  if (status === 403 && /acesso[\s\S]{0,2000}negado[\s\S]{0,2000}para\s+o\s+IP\b/i.test(body)) {
    return "O tribunal bloqueou o IP de saída do servidor (HTTP 403). Solicite ao tribunal a autorização institucional e a liberação desse IP para o MNI. Trocar o certificado ou o OTP não resolve esse bloqueio.";
  }
  if (status === 401 || status === 403) return `O tribunal recusou o acesso (HTTP ${status}). Confira a autorização do serviço, as credenciais e a liberação do IP. Essa resposta não comprova defeito no certificado.`;
  if (status === 429) return "O tribunal limitou as consultas (HTTP 429). Aguarde antes de tentar novamente.";
  if (status >= 300 && status < 400) return `O tribunal redirecionou a requisição (HTTP ${status}). Confira o endereço oficial do MNI; o LegalOS não encaminha o certificado a outro endereço.`;
  return `O tribunal respondeu com erro HTTP ${status}.`;
}

export function mniNetworkError(error: NodeJS.ErrnoException): string {
  const code = error.code ?? "";
  if (["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT"].includes(code)) {
    return `Não foi possível validar a cadeia HTTPS do tribunal (${code}). A administração deve conferir a cadeia oficial e configurar MNI_EXTRA_CA_FILE quando necessário. A validação de segurança permanece ligada.`;
  }
  if (code === "CERT_HAS_EXPIRED") return "O certificado HTTPS apresentado pelo tribunal venceu (CERT_HAS_EXPIRED). O tribunal precisa renová-lo; não é a validade do A1 guardado no LegalOS.";
  if (code === "CERT_NOT_YET_VALID") return "O certificado HTTPS do tribunal ainda não é válido (CERT_NOT_YET_VALID). Confira o relógio do servidor e a validade publicada pelo tribunal.";
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID") return "O certificado HTTPS não corresponde ao endereço do tribunal (ERR_TLS_CERT_ALTNAME_INVALID). Confira o endereço oficial; a validação de identidade não será desativada.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Não foi possível resolver o domínio do tribunal. Confira o endereço e a disponibilidade do DNS.";
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return "O tribunal demorou demais para responder. Confira a disponibilidade do ambiente e a liberação de rede.";
  if (code === "ECONNRESET" || code === "EPIPE") return "A conexão foi encerrada antes de concluir a resposta. O ambiente pode estar indisponível ou restringir o acesso; não foi possível confirmar a causa nem consultar os dados.";
  if (code === "ECONNREFUSED") return "O servidor do tribunal recusou a conexão de rede. Confira a disponibilidade do ambiente e o endereço publicado.";
  if (/^(ERR_SSL_|ERR_TLS_)/.test(code) || /SSL|TLS/i.test(error.message)) return "A negociação TLS com o tribunal falhou. Confira o protocolo e a autenticação exigidos pelo ambiente. Esse erro sozinho não identifica problema na cadeia nem no certificado A1.";
  return "Não foi possível falar com o tribunal. Confira a disponibilidade do serviço e a autorização de acesso.";
}
