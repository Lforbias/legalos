import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { PersonalBridgeKeys, OtpSetup, OtpCode, DiscoveryRow, ManualDiscovery } from "@/modules/pje/pje-ui";
import { PjeConnectCard, type PortalRowView } from "@/modules/portal-access/portal-ui";
import { formatDateTime } from "@/lib/dates/format";
import { listMyPortalAccesses, pjeTargetOptions } from "@/server/services/portal-access.service";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { listPersonalPjeKeys } from "@/server/services/apikey.service";
import { listCourtOtps } from "@/server/services/court-otp.service";
import { listPjeDiscoveries } from "@/server/services/pje-discovery.service";
import { listCaseOptions } from "@/server/services/case.service";
import { vaultAvailable } from "@/server/services/certificate.service";
export const metadata = { title: "Conectar o PJe" };
export default async function PjePage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const [otps, pending, cases, keys, accesses] = await Promise.all([listCourtOtps(ctx), listPjeDiscoveries(ctx), listCaseOptions(ctx), listPersonalPjeKeys(ctx), listMyPortalAccesses(ctx)]);
  const rows: PortalRowView[] = accesses.map((a) => ({
    id: a.id,
    targetLabel: a.targetLabel,
    status: a.status,
    enabled: a.enabled,
    statusMessage: a.statusMessage,
    documentHint: a.documentHint,
    hasOtp: a.hasOtp,
    lastLogin: a.lastLoginAt ? formatDateTime(a.lastLoginAt, ctx.timezone) : null,
    technical: a.lastJob && a.lastJob.status !== "QUEUED" && a.lastJob.status !== "RUNNING" ? JSON.stringify(a.lastJob.summary, null, 2).slice(0, 3000) : null,
  }));
  return <div className="mx-auto max-w-4xl space-y-5">
    <Link href="/integracoes" className="text-sm text-muted hover:underline">Voltar para integrações</Link>
    <PageHeader title="Conectar o PJe" description="Certificado/PJeOffice no navegador e captura assistida para o Box. O teste de login por senha é um fluxo separado e não importa expedientes." />
    <PjeConnectCard targets={pjeTargetOptions()} rows={rows} />
    <details className="rounded-xl border border-border p-4">
    <summary className="cursor-pointer text-sm font-medium">Opções avançadas: extensão do navegador, autenticador e processos detectados</summary>
    <div className="mt-4 space-y-5">
    <Alert tone="info">A extensão detecta CNJs nas páginas que você acessa em tribunais autorizados. Não observa o tribunal com o navegador fechado, não protocola e não confirma que um processo acabou de ser distribuído. Integração ainda aguardando validação em um acesso real ao PJe.</Alert>
    <Card><CardHeader title="1. Entrar com o código do seu celular" description="Login assistido no PJe / Jus.br, sem copiar a chave do seu autenticador." /><CardBody className="space-y-3 text-sm">
      <p>Abra o login oficial do tribunal no Chrome ou Edge e conclua a primeira etapa com certificado/PJeOffice ou CPF e senha. Quando o portal pedir o segundo fator, abra a extensão LegalOS PJe e clique em Verificar pedido de OTP nesta aba.</p>
      <p>O assistente pede os seis dígitos do seu celular e os envia uma única vez ao formulário oficial reconhecido. O código não passa pelo servidor LegalOS e não é guardado. Se a aba mudar, o pedido expirar ou o tribunal recusar, confira o login e informe um código novo.</p>
      <p className="text-xs text-muted">Compatibilidade inicial: formulário OTP do SSO PJe/Jus.br. A extensão não conclui a primeira etapa por você, não solicita ciência nem protocola. Enviar o OTP não comprova login aceito e não autoriza a conexão MNI. A consulta automática de movimentos pelo portal é uma etapa separada.</p>
      <div className="flex flex-wrap gap-2"><a href="https://pje1g.trf1.jus.br/pje/" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}>Abrir login TRF1 · 1º grau</a><a href="/downloads/legalos-pje.zip" download className={buttonVariants({ variant: "secondary" })}>Baixar extensão com OTP assistido</a></div>
    </CardBody></Card>
    <Card><CardHeader title="Opcional: gerar o OTP dentro do LegalOS" description="Use apenas se quiser manter uma cópia cifrada da chave do autenticador. Não é necessário para usar o código do celular." /><CardBody className="space-y-4">
      {vaultAvailable() ? <OtpSetup /> : <Alert tone="warning">Habilite o cofre de certificados para guardar o autenticador cifrado.</Alert>}
      {otps.map(item => <OtpCode key={item.id} id={item.id} label={item.label} />)}
      <p className="text-xs text-muted">O código é usado no login oficial do tribunal, diretamente ou pelo assistente da extensão. Ele não é enviado ao MNI e não abre uma sessão automaticamente. O teste de cadastro confirma a chave e o código, não o acesso ao tribunal.</p>
    </CardBody></Card>
    <Card><CardHeader title="2. Detectar processos no navegador" /><CardBody className="space-y-3 text-sm">
      <p>Use Chrome ou Edge no computador. Baixe e extraia a extensão, abra chrome://extensions (ou edge://extensions), ative o modo de desenvolvedor e escolha Carregar sem compactação, selecionando a pasta extraída.</p>
      <p>Crie sua conexão pessoal abaixo e cole a chave na extensão. Confira o nome do escritório mostrado antes de ligar o envio automático. Cada pessoa precisa da própria conexão para manter sua fila pessoal. Exige 2FA ativo no LegalOS.</p>
      {can(ctx, "cases:write") ? <PersonalBridgeKeys items={keys.map(k => ({ ...k, expiresAt: k.expiresAt?.toISOString() ?? null }))} /> : null}
      <p>No PJe, clique na extensão e autorize somente aquele tribunal. Ligue o envio automático se desejar. O login e o segundo fator continuam na página oficial. A extensão não lê senhas, cookies, PDFs nem valores dos formulários; envia números CNJ e a origem HTTPS do tribunal.</p>
      <div className="flex gap-2"><a href="/downloads/legalos-pje.zip" download className={buttonVariants({ variant: "secondary" })}>Baixar extensão</a>{can(ctx, "integrations:manage") ? <Link href="/integracoes#api" className={buttonVariants({ variant: "ghost" })}>Gerenciar chave na página Integrações</Link> : null}</div>
    </CardBody></Card>
    <section className="space-y-4"><h2 className="text-xl font-semibold">3. Conferir e vincular ({pending.length}{pending.length === 100 ? "+" : ""})</h2>
      <p className="text-sm text-muted">Fila pessoal. Um cliente pode ter vários casos: o nome sozinho não escolhe o vínculo. Números repetidos são deduplicados; processos já conhecidos são reutilizados quando você tem acesso.</p>
      {can(ctx, "cases:write") ? <><ManualDiscovery />{pending.map(row => <DiscoveryRow key={row.id} row={row} cases={cases} canCreate={can(ctx, "clients:read")} />)}</> : <p className="text-sm text-muted">Seu perfil não permite cadastrar ou vincular processos.</p>}
      {!pending.length ? <p className="text-sm text-muted">Nenhum número aguardando conferência.</p> : null}
    </section>
    </div>
    </details>
  </div>;
}
