"use client";

import { Mail, Pencil, Phone, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Textarea } from "@/components/ui/form";
import { formatPhone } from "@/lib/format/phone";
import { addContactAction, deleteContactAction, updateContactAction } from "./actions";
import { contactSchema, type ContactInput } from "./schemas";

export type ContactRow = { id: string; name: string; role: string | null; email: string | null; phone: string | null; isPrimary: boolean; notes: string | null };

const EMPTY: ContactInput = { name: "", role: "", email: "", phone: "", isPrimary: false, notes: "" };

function ContactForm({ clientId, contact, onDone, onCancel }: { clientId: string; contact?: ContactRow; onDone: () => void; onCancel: () => void }) {
  const { form, submit, pending, message } = useServerForm<ContactInput, undefined>({
    schema: contactSchema,
    defaultValues: contact
      ? { name: contact.name, role: contact.role ?? "", email: contact.email ?? "", phone: contact.phone ?? "", isPrimary: contact.isPrimary, notes: contact.notes ?? "" }
      : EMPTY,
    action: (v) => (contact ? updateContactAction(clientId, contact.id, v) : addContactAction(clientId, v)),
    onSuccess: onDone,
  });
  const err = (n: keyof ContactInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-md border border-border bg-surface-2/50 p-3">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome" htmlFor="contact-name" error={err("name")}>
          <Input id="contact-name" {...form.register("name")} />
        </Field>
        <Field label="Cargo / relação" htmlFor="contact-role" error={err("role")}>
          <Input id="contact-role" {...form.register("role")} />
        </Field>
        <Field label="E-mail" htmlFor="contact-email" error={err("email")}>
          <Input id="contact-email" type="email" {...form.register("email")} />
        </Field>
        <Field label="Telefone" htmlFor="contact-phone" error={err("phone")}>
          <Input id="contact-phone" inputMode="tel" {...form.register("phone")} />
        </Field>
      </div>
      <Field label="Observações" htmlFor="contact-notes" error={err("notes")}>
        <Textarea id="contact-notes" rows={2} {...form.register("notes")} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" {...form.register("isPrimary")} /> Contato principal
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {contact ? "Salvar contato" : "Adicionar contato"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function ContactsManager({ clientId, contacts, canWrite }: { clientId: string; contacts: ContactRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<{ kind: "none" } | { kind: "new" } | { kind: "edit"; id: string }>({ kind: "none" });
  const done = () => {
    setMode({ kind: "none" });
    router.refresh();
  };
  return (
    <Card>
      <CardHeader
        title="Contatos e pessoas de referência"
        action={
          canWrite && mode.kind === "none" ? (
            <Button size="sm" variant="secondary" onClick={() => setMode({ kind: "new" })}>
              Novo contato
            </Button>
          ) : undefined
        }
      />
      <CardBody className="space-y-3">
        {mode.kind === "new" ? <ContactForm clientId={clientId} onDone={done} onCancel={() => setMode({ kind: "none" })} /> : null}
        {contacts.length === 0 && mode.kind !== "new" ? <p className="text-sm text-muted">Nenhum contato adicional cadastrado.</p> : null}
        {contacts.map((c) =>
          mode.kind === "edit" && mode.id === c.id ? (
            <ContactForm key={c.id} clientId={clientId} contact={c} onDone={done} onCancel={() => setMode({ kind: "none" })} />
          ) : (
            <div key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0 space-y-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {c.name}
                  {c.isPrimary ? (
                    <Badge tone="info">
                      <Star className="mr-1 h-3 w-3" aria-hidden /> Principal
                    </Badge>
                  ) : null}
                </p>
                {c.role ? <p className="text-xs text-muted">{c.role}</p> : null}
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {c.email ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" aria-hidden /> {c.email}
                    </span>
                  ) : null}
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" aria-hidden /> {formatPhone(c.phone)}
                    </span>
                  ) : null}
                </p>
                {c.notes ? <p className="whitespace-pre-wrap text-xs text-muted">{c.notes}</p> : null}
              </div>
              {canWrite ? (
                <div className="flex items-start gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setMode({ kind: "edit", id: c.id })} aria-label={`Editar contato ${c.name}`}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                  </Button>
                  <ConfirmAction label="Excluir" confirmLabel="Excluir contato" action={() => deleteContactAction(clientId, c.id)} onDone={() => router.refresh()} />
                </div>
              ) : null}
            </div>
          ),
        )}
      </CardBody>
    </Card>
  );
}
