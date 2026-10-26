"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { setProviderAction, testProviderAction } from "./actions";

export function ProviderForm({ provider, model, hasOfficeKey }: { provider: string; model: string | null; hasOfficeKey: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(provider);
  const [clear, setClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  return <form className="space-y-3 rounded-lg border border-border p-4" onSubmit={e => {
    e.preventDefault(); const form = e.currentTarget; const fd = new FormData(form);
    setError(null); setSuccess(null);
    start(async () => {
      try {
        const r = await setProviderAction({ provider: selected, model: String(fd.get("model") ?? ""), apiKey: String(fd.get("apiKey") ?? "").trim() || undefined, clearKey: clear });
        if (!r.ok) { setError(r.message ?? "Não foi possível salvar."); return; }
        const field = form.elements.namedItem("apiKey") as HTMLInputElement | null;
        if (field) field.value = "";
        setClear(false); setSuccess("Configuração salva. A chave fica protegida e o campo vazio não significa que ela foi apagada."); router.refresh();
      } catch { setError("Não foi possível salvar. Confira a conexão e tente novamente."); }
    });
  }}>
    <h2 className="text-sm font-semibold">Provedor de IA do escritório</h2>
    <p className="text-xs text-muted">Esta configuração é usada pela RUTE e pelas ferramentas de IA do escritório. Salvar não liga os recursos automaticamente.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Provedor" htmlFor="rp-p"><Select id="rp-p" name="provider" value={selected} onChange={e => { setSelected(e.target.value); setError(null); setSuccess(null); }}><option value="ANTHROPIC">Claude (Anthropic)</option><option value="GEMINI">Gemini (Google)</option><option value="OPENAI">OpenAI</option></Select></Field>
      <Field label="Modelo (opcional)" htmlFor="rp-m" hint="Vazio = modelo padrão do provedor."><Input key={selected} id="rp-m" name="model" defaultValue={selected === provider ? model ?? "" : ""} maxLength={80} /></Field>
    </div>
    <Field label="Chave de API do escritório (opcional)" htmlFor="rp-k" hint={hasOfficeKey && selected === provider ? "Já há uma chave salva (cifrada). Deixe vazio para manter ou preencha para trocar." : "Cole a chave gerada no provedor escolhido. Sem chave própria, usa a chave do sistema, se existir."}><Input id="rp-k" name="apiKey" type="password" autoComplete="off" maxLength={300} disabled={clear} /></Field>
    {selected === "GEMINI" ? <p className="text-xs text-muted">Use a chave do Google AI Studio. Chaves de autorização com prefixo AQ. também são aceitas no cadastro.</p> : null}
    {selected !== provider && hasOfficeKey ? <p className="text-xs text-warning">Ao trocar o provedor, cadastre a chave correspondente. A chave do provedor anterior não será reutilizada.</p> : null}
    {hasOfficeKey ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clear} onChange={e => setClear(e.target.checked)} />Remover a chave salva</label> : null}
    {error ? <Alert tone="error">{error}</Alert> : null}{success ? <Alert tone="success">{success}</Alert> : null}
    <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" loading={pending} disabled={testing}>Salvar configuração de IA</Button><Button type="button" variant="secondary" size="sm" loading={testing} disabled={pending} onClick={() => {
      setError(null); setSuccess(null); startTest(async () => {
        try { const r = await testProviderAction(); if (!r.ok) setError(r.message ?? "Não foi possível testar."); else setSuccess(`Conexão confirmada com o modelo ${r.data?.model}.`); } catch { setError("Não foi possível testar a conexão agora."); }
      });
    }}>Testar configuração salva</Button></div>
    <p className="text-xs text-muted">O teste usa a configuração já salva e envia apenas uma mensagem de teste, sem dados do escritório. Pode consumir uma pequena quantidade de tokens do provedor.</p>
  </form>;
}
