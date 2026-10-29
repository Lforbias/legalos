"use client";
import { BOX_AVAILABLE, isBoxPermission } from "@/lib/box-retirement";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ALL_PERMISSIONS, VISIBLE_PERMISSION_GROUPS, PERMISSION_LABELS } from "@/lib/permissions/catalog";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "./actions";

type Role = { id: string; key: string; name: string; description: string | null; permissions: string[]; isSystem: boolean; memberCount: number };

export function RolesManager({ roles, actorPermissions, actorIsOwner, canManage }: { roles: Role[]; actorPermissions: string[]; actorIsOwner: boolean; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Role | "new" | null>(null);
  const [feedback, setFeedback] = React.useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  const actorSet = React.useMemo(() => new Set(actorPermissions), [actorPermissions]);

  return (
    <div className="space-y-4">
      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}
      {canManage && !editing ? <Button onClick={() => setEditing("new")}>Novo perfil personalizado</Button> : null}
      {editing ? (
        <RoleEditor
          key={editing === "new" ? "new" : editing.id}
          role={editing === "new" ? null : editing}
          actorSet={actorSet}
          actorIsOwner={actorIsOwner}
          onCancel={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setFeedback({ tone: "success", text });
            router.refresh();
          }}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={r.name}
              description={r.description ?? undefined}
              action={r.isSystem ? <Badge tone="neutral">Sistema</Badge> : <Badge tone="accent">Personalizado</Badge>}
            />
            <CardBody className="space-y-3">
              <p className="text-xs text-muted">
                {r.permissions.length} permissões · {r.memberCount} membro(s)
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-primary-text">Ver permissões</summary>
                <ul className="mt-2 columns-1 gap-4 text-muted sm:columns-2">
                  {ALL_PERMISSIONS.filter((k) => (BOX_AVAILABLE || !isBoxPermission(k)) && r.permissions.includes(k)).map((k) => (
                    <li key={k} className="break-inside-avoid py-0.5">
                      {PERMISSION_LABELS[k]}
                    </li>
                  ))}
                </ul>
              </details>
              {canManage && !r.isSystem ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={pending}
                    disabled={r.memberCount > 0}
                    title={r.memberCount > 0 ? "Reatribua os membros antes de excluir." : undefined}
                    onClick={() =>
                      start(async () => {
                        const res = await deleteRoleAction(r.id);
                        setFeedback(res.ok ? { tone: "success", text: "Perfil excluído." } : { tone: "error", text: res.message ?? "Falha ao excluir." });
                        if (res.ok) router.refresh();
                      })
                    }
                  >
                    Excluir
                  </Button>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  actorSet,
  actorIsOwner,
  onCancel,
  onSaved,
}: {
  role: Role | null;
  actorSet: Set<string>;
  actorIsOwner: boolean;
  onCancel: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = React.useState(role?.name ?? "");
  const [description, setDescription] = React.useState(role?.description ?? "");
  const [selected, setSelected] = React.useState<Set<string>>(new Set(role?.permissions ?? []));
  const [error, setError] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState<string | undefined>();
  const [pending, start] = React.useTransition();

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setNameError("Informe o nome do perfil.");
      return;
    }
    setNameError(undefined);
    start(async () => {
      const payload = { name, description, permissions: [...selected] };
      const res = role ? await updateRoleAction(role.id, payload) : await createRoleAction(payload);
      if (res.ok) onSaved(role ? "Perfil atualizado." : "Perfil criado.");
      else setError(res.message ?? "Falha ao salvar.");
    });
  };

  return (
    <Card>
      <CardHeader title={role ? `Editar perfil: ${role.name}` : "Novo perfil personalizado"} description="Você só pode conceder permissões que você mesmo possui." />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome" htmlFor="role-name" error={nameError}>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </Field>
            <Field label="Descrição (opcional)" htmlFor="role-desc">
              <Textarea id="role-desc" rows={1} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {VISIBLE_PERMISSION_GROUPS.map((g) => (
              <fieldset key={g.key} className="rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-semibold text-muted">{g.label}</legend>
                <div className="space-y-1.5">
                  {g.permissions.map((p) => {
                    const allowed = actorIsOwner || actorSet.has(p.key);
                    return (
                      <label key={p.key} className={`flex items-start gap-2 text-sm ${allowed ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`} title={allowed ? undefined : "Você não possui esta permissão."}>
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={selected.has(p.key)} disabled={!allowed} onChange={() => toggle(p.key)} />
                        <span>{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              Salvar perfil
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
