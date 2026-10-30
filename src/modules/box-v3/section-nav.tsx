import Link from "next/link";

const links = [
  { href: "/box-v3", label: "Visão geral", permission: "inbox:read" },
  { href: "/box-v3/entrada", label: "Caixa de entrada", permission: "inbox:read" },
  { href: "/box-v3/conexoes", label: "Conexões", permission: "inbox:read" },
  { href: "/box-v3/monitoramento", label: "Monitoramento", permission: "inbox:read" },
  { href: "/box-v3/sincronizacoes", label: "Sincronizações", permission: "inbox:read" },
  { href: "/box-v3/peticionamento", label: "Fila de protocolos", permission: "petitions:read" },
  { href: "/box-v3/importacoes", label: "Importações", permission: "cases:read" },
  { href: "/box-v3/configuracoes", label: "Certificados e acessos", permissionAny: ["certificates:manage", "integrations:manage", "cases:read"] },
];

export function BoxV3SectionNav({ permissions, current }: { permissions: ReadonlySet<string>; current: string }) {
  const available = links.filter((item) => item.permissionAny ? item.permissionAny.some((permission) => permissions.has(permission)) : permissions.has(item.permission!));
  return (
    <nav aria-label="Seções do Box 3.0" className="flex gap-1 overflow-x-auto border-b border-border">
      {available.map((item) => (
        <Link key={item.href} href={item.href} aria-current={current === item.href ? "page" : undefined} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${current === item.href ? "border-primary font-medium" : "border-transparent text-muted hover:text-fg"}`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
