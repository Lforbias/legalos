const isProd = process.env.NODE_ENV === "production";
/** O prefixo __Host- exige Secure + Path=/ e impede que subdomínios sobrescrevam o cookie. */
export const SESSION_COOKIE = isProd ? "__Host-lo_session" : "lo_session";
