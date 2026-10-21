"use client";

import * as React from "react";
import { useForm, type DefaultValues, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import type { ActionState } from "@/lib/validation/common";

/**
 * Formulário com validação no cliente (React Hook Form + Zod) e no servidor (a Server Action
 * revalida com o MESMO schema). Erros por campo vindos do servidor são aplicados no formulário.
 */
export function useServerForm<T extends FieldValues, R>({
  schema,
  defaultValues,
  action,
  onSuccess,
}: {
  schema: ZodType<T, T>;
  defaultValues: DefaultValues<T>;
  action: (values: T) => Promise<ActionState<R>>;
  onSuccess?: (data: R | undefined, form: UseFormReturn<T>) => void;
}) {
  const form = useForm<T>({ resolver: zodResolver(schema as never), defaultValues, mode: "onSubmit" });
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(null);

  const submit = form.handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      let res: ActionState<R>;
      try {
        res = await action(values as T);
      } catch {
        setMessage("Falha de comunicação com o servidor. Verifique sua conexão e tente novamente.");
        return;
      }
      if (!res.ok) {
        setMessage(res.message ?? "Não foi possível concluir a operação.");
        for (const [field, errors] of Object.entries(res.fieldErrors ?? {})) {
          if (errors?.[0]) form.setError(field as Path<T>, { message: errors[0] });
        }
        return;
      }
      onSuccess?.(res.data, form);
    });
  });

  return { form, submit, pending, message, setMessage };
}

export function fieldError<T extends FieldValues>(form: UseFormReturn<T>, name: Path<T>): string | undefined {
  const err = form.formState.errors[name];
  return typeof err?.message === "string" ? err.message : undefined;
}
