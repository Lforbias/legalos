import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { ctx } = await requireTenant();
  const items = [
    { href: "/configuracoes", label: "Escritório" },
    ...(can(ctx, "members:read") ? [{ href: "/configuracoes/equipe", label: "Equipe" }, { href: "/configuracoes/perfis", label: "Perfis de acesso" }] : []),
    ...(can(ctx, "audit:read") ? [{ href: "/configuracoes/auditoria", label: "Auditoria" }] : []),
    ...(can(ctx, "cases:read") ? [{ href: "/configuracoes/campos", label: "Campos personalizados" }] : []),
    ...(can(ctx, "tasks:read") ? [{ href: "/configuracoes/tarefas", label: "Tarefas (tipos e etiquetas)" }] : []),
    ...(can(ctx, "tasks:read") ? [{ href: "/configuracoes/pacotes", label: "Pacotes de tarefas" }] : []),
    ...(can(ctx, "billing:manage") ? [{ href: "/configuracoes/creditos", label: "Créditos" }] : []),
    ...(can(ctx, "cases:read") ? [{ href: "/configuracoes/credenciais", label: "Credenciais dos tribunais" }] : []),
    ...(can(ctx, "integrations:manage") ? [{ href: "/configuracoes/tribunais", label: "Sistemas dos tribunais" }] : []),
    { href: "/conta", label: "Minha conta" },
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Configurações" />
      <SettingsNav items={items} />
      {children}
    </div>
  );
}
