import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import forge from "node-forge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchWsdl } from "@/lib/mni/transport";
import { mniHttpError, mniNetworkError } from "@/lib/mni/transport-errors";

describe("diagnóstico de transporte MNI sem expor respostas ou credenciais", () => {
  it("distingue o bloqueio de IP real do TRF1 de uma recusa genérica", () => {
    const body = '<h1>Acesso Negado</h1><p>O acesso &#224; URL /pje/intercomunicacao?wsdl foi negado para o IP 192.0.2.1.</p>';
    expect(mniHttpError(403, body)).toMatch(/bloqueou o IP/);
    expect(mniHttpError(403, body)).not.toContain("192.0.2.1");
    expect(mniHttpError(403, "segredo")).toMatch(/não comprova defeito/);
    expect(mniHttpError(403, "segredo")).not.toContain("segredo");
    expect(mniHttpError(429, "")).toMatch(/Aguarde/);
    expect(mniHttpError(302, "https://outro.example/segredo")).toMatch(/não encaminha o certificado/);
  });
  it("só orienta configurar CA para erros comprovados de confiança", () => {
    const error = (code: string, message = "dado sensível") => Object.assign(new Error(message), { code });
    expect(mniNetworkError(error("UNABLE_TO_VERIFY_LEAF_SIGNATURE"))).toContain("MNI_EXTRA_CA_FILE");
    expect(mniNetworkError(error("CERT_HAS_EXPIRED"))).toMatch(/tribunal venceu/);
    expect(mniNetworkError(error("ERR_TLS_CERT_ALTNAME_INVALID"))).toMatch(/não corresponde/);
    for (const code of ["ECONNRESET", "EPIPE", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNREFUSED", "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE", "UNKNOWN"]) {
      const message = mniNetworkError(error(code));
      expect(message).not.toContain("MNI_EXTRA_CA_FILE");
      expect(message).not.toContain("dado sensível");
    }
    expect(mniNetworkError(error("ECONNRESET"))).toMatch(/não foi possível confirmar/);
  });
});

describe("transporte real local — sem tribunal e sem certificado de cliente real", () => {
  let server: http.Server; let secure: https.Server; let url: string; let secureUrl: string;
  beforeAll(async () => {
    server = http.createServer((_req, res) => { res.writeHead(403); res.end("<h1>Acesso Negado</h1><p>URL negado para o IP 192.0.2.1</p>"); });
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/intercomunicacao`;
    const keys = forge.pki.rsa.generateKeyPair(2048); const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey; cert.serialNumber = "01";
    cert.validity.notBefore = new Date(Date.now() - 10000); cert.validity.notAfter = new Date(Date.now() + 86400000);
    cert.setSubject([{ name: "commonName", value: "localhost" }]); cert.setIssuer(cert.subject.attributes);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    secure = https.createServer({ key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert) }, (_req, res) => res.end("<definitions/>"));
    await new Promise<void>(r => secure.listen(0, "127.0.0.1", r));
    secureUrl = `https://127.0.0.1:${(secure.address() as AddressInfo).port}/intercomunicacao`;
  });
  afterAll(async () => { await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => secure.close(() => r()))]); });
  it("transforma a resposta de bloqueio do TRF1 em orientação específica", async () => {
    await expect(fetchWsdl(url)).rejects.toThrow(/bloqueou o IP/);
  });
  it("continua recusando servidor HTTPS sem cadeia confiável", async () => {
    await expect(fetchWsdl(secureUrl)).rejects.toThrow(/validar a cadeia HTTPS/);
  });
});
