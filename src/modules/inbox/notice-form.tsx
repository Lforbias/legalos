"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Wand2 } from "lucide-react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { analyzeTextAction, createNoticeAction } from "./actions";
import { NOTICE_KINDS, NOTICE_KIND_LABEL, noticeSchema, type NoticeInput } from "./schemas";

export function NoticeForm({ initial, cases }: { initial: NoticeInput; cases: { id: string; title: string; number: string | null }[] }) {
  const router = useRouter();
  const [info, setInfo] = React.useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [analyzing, startAnalyze] = React.useTransition();
  const { form, submit, pending, message } = useServerForm<NoticeInput, { id: string; autoLinked: boolean; duplicate: boolean }>({
    schema: noticeSchema,
    defaultValues: initial,
    action: (v) => createNoticeAction(v),
    onSuccess: (data) => {
      router.replace(`/caixa-de-entrada/${data?.id}`);
      router.refresh();
    },
  });
  const err = (n: keyof NoticeInput) => fieldError(form, n);

  const analyze = () => {
    setInfo(null);
    const text = form.getValues("content");
    if (text.trim().length < 10) {
      setInfo({ tone: "warning", text: "Cole o texto da intimação antes de analisar." });
      return;
    }
    startAnalyze(async () => {
      const res = await analyzeTextAction({ text });
      if (!res.ok || !res.data) {
        setInfo({ tone: "warning", text: res.message ?? "Não foi possível analisar o texto." });
        return;
      }
      const p = res.data;
      const found: string[] = [];
      if (p.caseNumber) { form.setValue("caseNumber", p.caseNumber, { shouldDirty: true }); found.push(`processo ${p.caseNumber}`); }
      if (p.publishedAt) { form.setValue("publishedAt", p.publishedAt, { shouldDirty: true }); found.push("data de publicação"); }
      if (p.kind) { form.setValue("kind", p.kind, { shouldDirty: true }); found.push(`tipo ${NOTICE_KIND_LABEL[p.kind].toLowerCase()}`); }
      if (p.court && !form.getValues("court")) { form.setValue("court", p.court, { shouldDirty: true }); found.push("órgão"); }
      if (!form.getValues("title") && p.kind) form.setValue("title", `${NOTICE_KIND_LABEL[p.kind]}${p.caseNumber ? ` — ${p.caseNumber}` : ""}`, { shouldDirty: true });
      form.setValue("source", "PASTED", { shouldDirty: true });
      setInfo({
        tone: found.length ? "info" : "warning",
        text: found.length
          ? `Campos sugeridos a partir do texto: ${found.join(", ")}. Confira antes de salvar.${p.suggestedDays ? ` O texto menciona prazo de ${p.suggestedDays} dia(s) — o prazo só é cadastrado por você, depois, com validação.` : ""}`
          : "Não encontrei número de processo, data ou tipo no texto. Preencha manualmente.",
      });
    });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(txt|csv)$/i.test(file.name) || file.size > 500_000) {
      setInfo({ tone: "warning", text: "Aceito arquivos .txt ou .csv de até 500 KB. Para PDF, copie o texto e cole acima (não há OCR nesta versão)." });
      return;
    }
    const text = await file.text();
    form.setValue("content", text.slice(0, 50_000), { shouldDirty: true });
    form.setValue("source", "FILE", { shouldDirty: true });
    if (!form.getValues("title")) form.setValue("title", file.name.replace(/\.(txt|csv)$/i, "").slice(0, 200), { shouldDirty: true });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      {info ? <Alert tone={info.tone}>{info.text}</Alert> : null}
      <Card>
        <CardHeader title="Teor da intimação" description="Cole o texto recebido (Diário, e-mail do tribunal, portal). A análise é uma sugestão e não grava nada." />
        <CardBody className="space-y-3">
          <Field label="Texto" htmlFor="content" error={err("content")}>
            <Textarea id="content" rows={10} aria-invalid={Boolean(err("content"))} {...form.register("content")} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={analyze} loading={analyzing}>
              <Wand2 className="h-4 w-4" aria-hidden /> Analisar texto
            </Button>
            <label className="text-sm text-muted">
              ou carregar arquivo .txt:{" "}
              <input type="file" accept=".txt,.csv,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} className="text-xs" />
            </label>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Dados" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Título" htmlFor="title" error={err("title")}>
              <Input id="title" aria-invalid={Boolean(err("title"))} {...form.register("title")} />
            </Field>
          </div>
          <Field label="Tipo" htmlFor="kind" error={err("kind")}>
            <Select id="kind" {...form.register("kind")}>
              {NOTICE_KINDS.map((k) => (
                <option key={k} value={k}>{NOTICE_KIND_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Número do processo (CNJ)" htmlFor="caseNumber" error={err("caseNumber")} hint="Se existir um processo com este número, a intimação é vinculada automaticamente.">
            <Input id="caseNumber" autoComplete="off" aria-invalid={Boolean(err("caseNumber"))} {...form.register("caseNumber")} />
          </Field>
          <Field label="Tribunal / órgão" htmlFor="court" error={err("court")}>
            <Input id="court" {...form.register("court")} />
          </Field>
          <Field label="Data de publicação" htmlFor="publishedAt" error={err("publishedAt")}>
            <Input id="publishedAt" type="date" {...form.register("publishedAt")} />
          </Field>
          <Field label="Data de recebimento" htmlFor="receivedAt" error={err("receivedAt")}>
            <Input id="receivedAt" type="date" aria-invalid={Boolean(err("receivedAt"))} {...form.register("receivedAt")} />
          </Field>
          <Field label="Vincular ao processo" htmlFor="caseId" error={err("caseId")} hint="Opcional; sobrepõe o vínculo automático.">
            <Select id="caseId" {...form.register("caseId")}>
              <option value="">Automático / sem processo</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>{c.title}{c.number ? ` — ${c.number}` : ""}</option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>Registrar intimação</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
