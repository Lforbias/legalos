# Box 3.0 — autenticação, certificados e sessão de tribunal

Estado em 30/10/2026. Este documento mapeia o que o prompt mestre pede para a infraestrutura de sessão/credencial
PJe/eproc autenticada contra o que **já existe** no repositório (a maior parte construída antes desta
reconstrução, no Box 2.0, e corretamente mantida sob retirada — `BOX_AVAILABLE = false`), para não reconstruir o
que já funciona e para deixar explícito o que ainda falta, o que precisa ser redesenhado antes de voltar, e o que
exige autorização específica da titular antes de qualquer reativação.

## O que já existe (Box 2.0, hoje retirado atrás de `BOX_AVAILABLE`)

**Transporte MNI/SOAP** (`src/lib/mni/transport.ts`, `transport-errors.ts`): cliente HTTP próprio, sem biblioteca
SOAP de terceiros. Bloqueia IP privado/loopback/link-local/metadata (proteção SSRF — `isPrivateAddress`,
`safeLookup`), exige HTTPS (exceto em teste), recusa URL com usuário/senha embutidos, recusa IP/host interno no
lugar de domínio do tribunal, nunca segue redirect, limita o tamanho da resposta (20 MB) e do WSDL (2 MB), valida
a cadeia TLS sempre (nunca desliga `rejectUnauthorized`), suporta mTLS com certificado A1 (pfx+senha) opcional, e
as mensagens de erro (`transport-errors.ts`) nunca incluem corpo bruto da resposta, URL ou credencial — e são
deliberadamente conservadoras (ex.: "este erro sozinho não identifica problema na cadeia nem no certificado A1").

**Cliente MNI 2.2.2** (`src/lib/mni/xml.ts`): monta os envelopes SOAP (`consultarAvisosPendentes`,
`consultarProcesso`, `entregarManifestacaoProcessual`) e faz o parse das respostas. Ponto crítico já certo:
`parseEntregarManifestacao` **só** devolve sucesso se o tribunal informou um `protocoloRecebimento` — sem
protocolo, lança erro explícito "a petição NÃO deve ser considerada protocolada" (linha ~189). Isto já implementa,
na camada mais baixa, a regra de nunca confundir envio de documento com protocolo efetivado.

**Serviço de conexões MNI** (`src/server/services/mni.service.ts`, 498 linhas): CRUD de `CourtConnection` com
certificado do cofre + MFA obrigatório para criar/editar/apagar; modos de autenticação PASSWORD / CERTIFICATE /
PASSWORD_AND_CERTIFICATE; perfil especial `TJPR_SCMPP` (PROJUDI/TJPR, senha diária derivada); **verificação de
contrato WSDL antes de ligar a conexão** (`inspectConnectionContract` — nunca confunde isso com autenticação ou
homologação, comentário explícito na linha 467); resolução de credencial pessoal vs. da conexão do escritório
(`loadConnection` com `personal: true`); `syncAvisos` que **só lista avisos pendentes, nunca abre o teor** —
comentário explícito: "abrir o teor é o ato que gera CIÊNCIA e dispara a contagem do prazo. O teor deve ser aberto
conscientemente pelo advogado" (linha ~215); `consultCaseMni` (consulta movimentos, processos sigilosos bloqueados
antes de qualquer chamada externa); `importAutosMni` (baixa documentos em lotes de 5, até 25 por execução, pula
documento sigiloso/grande demais/tipo não suportado, nunca trata consulta de autos como geradora de ciência);
`runMniAll` (execução automática por todas as conexões ligadas, contexto do criador, nunca eleva permissão).
Evidência já gravada diretamente via `recordEvidence` com `environment` corretamente calculado como `SIMULATED`
quando o transporte é injetado (`evidenceEnv`, linha ~188) — mesmo critério usado no DJEN/DataJud.

**Robô Playwright do portal web** (`src/server/robots/pje-runner.ts` + `src/lib/robots/pje/login.ts`): fila com
`FOR UPDATE SKIP LOCKED` (sem corrida entre workers), backoff exponencial, detecção de bloqueio de conta (para e
desliga o acesso), detecção de CAPTCHA (para — **não tenta resolver**), recuperação de trabalhos travados. Estados
de `PortalAccess`/`RobotJob` definidos em `src/lib/robots/pje/outcome.ts`: `PENDING → CONNECTING → CONNECTED` ou
`NEEDS_ACTION`/`ERROR`, todos função pura e testável (`mapOutcome`).

**Certificados A1** (`src/server/services/certificate.service.ts`, 317 linhas): upload de PFX cifrado no cofre
(`sealBytes`/`openBytes`, chave `CERT_ENCRYPTION_KEY`), nunca expõe arquivo nem senha fora do serviço — a listagem
usa um `select` explícito (`safeSelect`, linha 55) que nem inclui as colunas de segredo. Separação clara entre
**consultar** (`consultationOnly`, padrão ao cadastrar) e **assinar/protocolar** (`enableCertificateSigning` —
exige permissão de administrar o cofre E de assinar, MFA, certificado vigente e digitar o nome do certificado
para confirmar; fica registrado em auditoria e **não envia nada ao tribunal** por si só). Usuários autorizados por
certificado (`CertificateAuthorizedUser.canSign`), uso registrado em `CertificateUsage` a cada vez que o material
é decifrado (`getCertificateMaterial`), aviso de vencimento em 30/7 dias (`runCertificateExpiryCheck`).

**Credenciais por usuário e tribunal** (`src/server/services/court-credential.service.ts`): cada pessoa guarda a
própria credencial (3.0-F6b); o segredo nunca volta para tela ou API (`documentHint` mascarado); administrador de
integrações vê quem tem credencial de quê, nunca o segredo.

**Modelo de dados já existente** (mapeamento para o vocabulário do prompt mestre — reaproveitar, não recriar):

| Prompt mestre | Já existe como | Observação |
|---|---|---|
| `JudicialPortal` | `src/lib/court-systems.ts` (`COURT_SYSTEMS`: pje-mni/eproc/esaj/projudi) | já documenta, por sistema, que a disponibilidade do MNI varia por tribunal — nunca assume uniformidade |
| `JudicialConnection` (nível escritório) | `CourtConnection` | WSDL, modo de auth, certificado, ambiente (UNSPECIFIED/HOMOLOGATION/PRODUCTION) |
| `JudicialConnection` (nível usuário/portal web) | `PortalAccess` | por usuário + sistema + alvo (tribunal) |
| `CredentialReference` | `secretEnc` em `CourtConnection`/`CourtCredential`/`PortalAccess`/`ClientCredential`, cifrado com a mesma chave do cofre (`src/lib/security/pfx.ts`) | nunca texto puro em coluna |
| `JudicialIdentity` (CPF/CNPJ do consultante) | `document`/`documentHint` dentro do segredo cifrado | sem tabela própria hoje; suficiente para o escopo atual |
| Evidência/homologação | `ConnectorEvidence` (já cruzado pela mesma `recordEvidence`/`coverageMatrix` usada por DJEN/DataJud) | não é um sistema separado |
| `JudicialSession` (estados) | **não existia como vocabulário único** — ver abaixo | gap real, preenchido nesta entrega |

## O que esta entrega acrescenta (seguro, sem reativar nada)

`src/lib/judicial/session-state.ts` (novo, puro, sem banco/rede/segredo): dá o nome único que faltava —
`not_configured / configuration_required / authenticating / human_action_required / authenticated / expired /
degraded / error` — derivado dos campos que já existem (`CourtConnection.wsdlStatus/lastStatus/enabled` e
`PortalAccess.status/enabled`). Não cria sessão, não abre segredo, não toca `assertBoxAvailable()`. Documentado no
próprio arquivo: para o MNI/SOAP não existe sessão viva entre chamadas (a credencial viaja em cada envelope); para
o robô Playwright também não existe hoje sessão persistida entre execuções (reautentica a cada trabalho) — então
"authenticated" nos dois casos significa "última tentativa bem-sucedida", nunca "há uma sessão aberta agora". Se
uma arquitetura futura (agente local / "LegalOS Box Companion") vier a manter sessão viva, a regra de nunca copiar
essa sessão para a nuvem sem autorização e revisão de segurança passa a se aplicar de verdade e este arquivo
precisa ser revisado. Testado em `src/tests/unit/judicial-session-state.test.ts` (sem dependência de banco — roda
em qualquer máquina).

## Achado importante: o login do robô de portal já automatiza o segundo fator (precisa ser redesenhado antes de qualquer reativação)

`src/lib/robots/pje/login.ts` (linhas ~12, ~131–140) guarda um `otpSecret` por credencial e **gera o código TOTP
sozinho** (`totpCode(creds.otpSecret, step)`) para preencher o campo de segundo fator do SSO do PJe (Keycloak/PDPJ)
quando o portal pede. Isto é automação de 2FA — algo que o prompt mestre desta reconstrução proíbe explicitamente
("nunca automatizar 2FA"). Este código é de uma versão anterior do produto (Box 2.0) e está corretamente desligado
hoje (atrás de `BOX_AVAILABLE`), então não há violação em produção agora. Mas registro aqui, com destaque, porque:
não deve ser copiado nem reaproveitado como está em nenhum trabalho novo de PJe/eproc desta reconstrução, e
precisaria ser redesenhado (ex.: pausar e pedir o código a uma pessoa, nunca gerá-lo) antes de cogitar reativar o
robô de portal.

## Por que nada de MNI/certificado/robô foi destravado nesta sessão (diferente do DJEN/DataJud)

DJEN e DataJud são fontes **públicas**: sem certificado, sem sessão de tribunal, sem credencial de ninguém —
qualquer escritório pode usá-las assim que o LegalOS existe. Por isso foram desacoplados de `BOX_AVAILABLE` nesta
sessão (commits `0b4fd8f`/`95f7ff1`) sem precisar de autorização adicional: não há "acesso judicial real" em jogo.

MNI/eproc/e-SAJ/PROJUDI autenticados, certificados A1/A3 e o robô de portal são exatamente o oposto: exigem
credencial real de um escritório real, autorização institucional do tribunal (às vezes liberação de IP, às vezes
ambiente de homologação próprio) e, no caso do robô, levantam o achado de 2FA automatizado acima. O prompt mestre
reserva para decisão explícita da titular qualquer coisa que envolva "uso de credenciais, acesso judicial real ou
publicação em produção" — isto se qualifica claramente. Por isso: a infraestrutura (contratos, transporte, cofre,
verificação de contrato, estado de sessão) está mapeada e, onde faltava nome único, foi completada; mas nenhuma
função com `assertBoxAvailable()` foi destravada, e nenhuma nova tentativa de autenticação real foi construída ou
simulada como se fosse real.

## Próximo incremento seguro (sem credencial real, sem reativar nada)

1. Usar `session-state.ts` na tela de conexões do Box 3.0 (`/box-v3/conexoes`) como um rótulo adicional ao lado do
   "Histórico preservado" já existente — só leitura, zero risco.
2. Se/quando a titular autorizar testar contra um ambiente de homologação real de algum tribunal (não produção,
   não escritório real): usar o transporte e o cliente MNI já existentes, registrar evidência com
   `environment: "HOMOLOGATION"` (já suportado), nunca declarar homologação a partir de teste só com transporte
   injetado.
3. Antes de cogitar reativar o robô de portal web para qualquer tribunal: redesenhar o 2FA (pedir o código a uma
   pessoa, nunca gerá-lo) — item isolado, independente do resto.
