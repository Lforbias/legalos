"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatDocument } from "@/lib/validation/br-documents";
import { ClientPicker } from "@/modules/clients/client-picker";
import { RegistryPicker } from "@/modules/registry/registry-picker";
import {
  addMemberAction,
  addNoteAction,
  addPartyAction,
  archiveCaseAction,
  changeCaseStatusAction,
  removeMemberAction,
  removePartyAction,
} from "./actions";
import { CASE_STATUSES, CASE_STATUS_LABEL, PARTY_ROLES, PARTY_ROLE_LABEL, noteSchema, partySchema, type NoteInput, type PartyInput } from "./schemas";

// ---------- situação ----------

export function StatusControl({ caseId, status, canWrite }: { caseId: string; status: string; canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div>
      <label htmlFor={`status-${caseId}`} className="sr-only">
        Situação do processo
      </label>
      <Select
        id={`status-${caseId}`}
        value={status}
        disabled={!canWrite || pending}
        className="h-8 w-auto text-xs"
        onChange={(e) => {
          setError(null);
          const next = e.target.value;
          startTransition(async () => {
            const res = await changeCaseStatusAction(caseId, next);
            if (!res.ok) setError(res.message ?? "Não foi possível alterar a situação.");
            router.refresh();
          });
        }}
      >
        {CASE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CASE_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function ArchiveCaseButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label="Excluir processo"
      confirmLabel="Excluir processo"
      description="O processo deixa de aparecer nas listas (exclusão lógica, registrada na auditoria)."
      size="md"
      action={() => archiveCaseAction(caseId)}
      onDone={() => {
        router.replace("/processos");
        router.refresh();
      }}
    />
  );
}

// ---------- partes ----------

export type PartyRow = { id: string; role: string; name: string; document: string | null; lawyerName: string | null; isOurClient: boolean; clientId: string | null; clientName: string | null };

function PartyForm({ caseId, onDone, onCancel }: { caseId: string; onDone: () => void; onCancel: () => void }) {
  const [clientLabel, setClientLabel] = React.useState("");
  const [registryLabel, setRegistryLabel] = React.useState("");
  const { form, submit, pending, message } = useServerForm<PartyInput, undefined>({
    schema: partySchema,
    defaultValues: { role: "DEFENDANT", clientId: "", registryId: "", saveToRegistry: false, name: "", document: "", lawyerName: "" },
    action: (v) => addPartyAction(caseId, v),
    onSuccess: onDone,
  });
  const clientId = form.watch("clientId");
  const registryId = form.watch("registryId") ?? "";
  const err = (n: keyof PartyInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-md border border-border bg-surface-2/50 p-3">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Posição" htmlFor="party-role" error={err("role")}>
          <Select id="party-role" {...form.register("role")}>
            {PARTY_ROLES.map((r) => (
              <option key={r} value={r}>
                {PARTY_ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cliente do escritório (opcional)" htmlFor="party-client" error={err("clientId")}>
          <ClientPicker
            id="party-client"
            value={clientId}
            label={clientLabel}
            onChange={(id, label) => {
              form.setValue("clientId", id, { shouldDirty: true });
              setClientLabel(label);
            }}
          />
        </Field>
        {!clientId ? (
          <>
            <div className="md:col-span-2">
              <Field label="Parte do cadastro único (opcional)" htmlFor="party-registry" error={err("registryId")}>
                <RegistryPicker
                  id="party-registry"
                  value={registryId}
                  label={registryLabel}
                  onChange={(id, label) => {
                    form.setValue("registryId", id, { shouldDirty: true });
                    setRegistryLabel(label);
                  }}
                />
              </Field>
            </div>
            {!registryId ? (
              <>
                <Field label="Nome da parte" htmlFor="party-name" error={err("name")}>
                  <Input id="party-name" {...form.register("name")} />
                </Field>
                <Field label="CPF/CNPJ (opcional)" htmlFor="party-document" error={err("document")}>
                  <Input id="party-document" {...form.register("document")} />
                </Field>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input type="checkbox" {...form.register("saveToRegistry")} /> Guardar no cadastro único para reaproveitar em outros processos
                </label>
              </>
            ) : null}
            <div className="md:col-span-2">
              <Field label="Advogado da parte (opcional)" htmlFor="party-lawyer" error={err("lawyerName")}>
                <Input id="party-lawyer" {...form.register("lawyerName")} />
              </Field>
            </div>
          </>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Adicionar parte
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function PartiesPanel({ caseId, parties, canWrite }: { caseId: string; parties: PartyRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  return (
    <Card>
      <CardHeader
        title="Partes do processo"
        action={
          canWrite && !adding ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              Adicionar parte
            </Button>
          ) : undefined
        }
      />
      <CardBody className="space-y-3">
        {adding ? (
          <PartyForm
            caseId={caseId}
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        ) : null}
        {parties.length === 0 && !adding ? <p className="text-sm text-muted">Nenhuma parte cadastrada.</p> : null}
        <ul className="divide-y divide-border">
          {parties.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {p.clientId ? <a href={`/clientes/${p.clientId}`} className="hover:underline">{p.clientName ?? p.name}</a> : p.name}
                  {p.isOurClient ? <Badge tone="success">Nosso cliente</Badge> : null}
                  <Badge>{PARTY_ROLE_LABEL[p.role as keyof typeof PARTY_ROLE_LABEL] ?? p.role}</Badge>
                </p>
                <p className="text-xs text-muted">
                  {p.document ? (p.document.length === 11 ? formatDocument("PERSON", p.document) : p.document.length === 14 ? formatDocument("COMPANY", p.document) : p.document) : "Documento não informado"}
                  {p.lawyerName ? ` · Adv.: ${p.lawyerName}` : ""}
                </p>
              </div>
              {canWrite ? <ConfirmAction label="Remover" confirmLabel="Remover parte" action={() => removePartyAction(caseId, p.id)} onDone={() => router.refresh()} /> : null}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

// ---------- equipe ----------

export type MemberRow = { userId: string; name: string; email: string; role: "RESPONSIBLE" | "COLLABORATOR" };

export function MembersPanel({
  caseId,
  members,
  candidates,
  canWrite,
  confidential,
}: {
  caseId: string;
  members: MemberRow[];
  candidates: { id: string; name: string }[];
  canWrite: boolean;
  confidential: boolean;
}) {
  const router = useRouter();
  const [userId, setUserId] = React.useState("");
  const [role, setRole] = React.useState<"RESPONSIBLE" | "COLLABORATOR">("COLLABORATOR");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const available = candidates.filter((c) => !members.some((m) => m.userId === c.id) || (role === "RESPONSIBLE" && members.find((m) => m.userId === c.id)?.role !== "RESPONSIBLE"));

  const add = () => {
    setError(null);
    startTransition(async () => {
      const res = await addMemberAction(caseId, userId, role);
      if (!res.ok) {
        setError(res.message ?? "Não foi possível adicionar.");
        return;
      }
      setUserId("");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader title="Equipe do processo" description={confidential ? "Processo sigiloso: apenas estes membros (e administradores) têm acesso." : undefined} />
      <CardBody className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {m.name} {m.role === "RESPONSIBLE" ? <Badge tone="info">Responsável</Badge> : <Badge>Colaborador</Badge>}
                </p>
                <p className="text-xs text-muted">{m.email}</p>
              </div>
              {canWrite ? <ConfirmAction label="Remover" confirmLabel="Remover da equipe" action={() => removeMemberAction(caseId, m.userId)} onDone={() => router.refresh()} /> : null}
            </li>
          ))}
          {members.length === 0 ? <li className="py-2 text-sm text-muted">Sem responsável definido.</li> : null}
        </ul>
        {canWrite ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <div className="min-w-48 flex-1">
              <label htmlFor="member-user" className="mb-1.5 block text-xs font-medium text-muted">
                Adicionar membro
              </label>
              <Select id="member-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Selecione…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="member-role" className="mb-1.5 block text-xs font-medium text-muted">
                Papel
              </label>
              <Select id="member-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                <option value="COLLABORATOR">Colaborador</option>
                <option value="RESPONSIBLE">Responsável</option>
              </Select>
            </div>
            <Button onClick={add} disabled={!userId} loading={pending}>
              Adicionar
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------- andamentos / anotações ----------

export function NoteForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<NoteInput, undefined>({
    schema: noteSchema,
    defaultValues: { title: "", description: "", occurredAt: "" },
    action: (v) => addNoteAction(caseId, v),
    onSuccess: (_d, f) => {
      f.reset();
      router.refresh();
    },
  });
  const err = (n: keyof NoteInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <Field label="Título (opcional)" htmlFor="note-title" error={err("title")}>
          <Input id="note-title" placeholder="Ex.: Reunião com o cliente" {...form.register("title")} />
        </Field>
        <Field label="Data do fato (opcional)" htmlFor="note-date" error={err("occurredAt")}>
          <Input id="note-date" type="date" {...form.register("occurredAt")} />
        </Field>
      </div>
      <Field label="Anotação" htmlFor="note-text" error={err("description")}>
        <Textarea id="note-text" rows={3} {...form.register("description")} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>
        Registrar anotação
      </Button>
    </form>
  );
}
