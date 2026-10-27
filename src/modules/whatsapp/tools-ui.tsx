"use client";
import { parseCampaignContacts } from "@/lib/whatsapp/campaign-import";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { setExtrasSettingsAction } from "./extras-actions";
import { campaignClientOptionsAction, approveCampaignAction, cancelCampaignAction, campaignReportAction, createCampaignAction, deleteChatStatusAction, deleteChecklistAction, deleteDialogAction, deleteIntentAction, deleteLibraryFileAction, forwardMessageAction, pauseCampaignAction, presetLabelsAction, saveChatStatusAction, saveChecklistAction, saveDialogAction, saveIntentAction, saveReportScheduleAction, saveSecurityAction, revokeOrgSessionAction, sendChecklistAction, sendLibraryFileAction, setChatStatusAction, setDialogActiveAction, setIntentActiveAction, testIntentsAction, transcribeAction } from "./tools-actions";

const Msg = ({ error, done }: { error: string | null; done: string | null }) => (error ? <Alert tone="error">{error}</Alert> : done ? <Alert tone="success">{done}</Alert> : null);
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

// ======================= etiquetas prontas, status, checklists, biblioteca =======================
export type ToolsAdminData = {
  statuses: { id: string; name: string; color: string }[];
  checklists: { id: string; title: string; items: string[] }[];
  library: { id: string; title: string; fileName: string; sizeBytes: number }[];
};

export function ToolsAdminPanel({ d }: { d: ToolsAdminData }) {
  const { run, pending, error, done } = useRun();
  const [st, setSt] = React.useState({ name: "", color: "#2563eb" });
  const [ck, setCk] = React.useState({ title: "", items: "" });
  const [lib, setLib] = React.useState({ title: "", busy: false, msg: null as string | null, err: null as string | null });
  const fileRef = React.useRef<HTMLInputElement>(null);
  async function upload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setLib((l) => ({ ...l, busy: true, msg: null, err: null }));
    const fd = new FormData();
    fd.set("title", lib.title);
    fd.set("file", f);
    const res = await fetch("/api/chat/library", { method: "POST", body: fd });
    const j = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string[]> };
    if (!res.ok) setLib((l) => ({ ...l, busy: false, err: j.fieldErrors?.title?.[0] ?? j.error ?? "Não foi possível guardar o arquivo." }));
    else { setLib({ title: "", busy: false, msg: "Arquivo guardado.", err: null }); if (fileRef.current) fileRef.current.value = ""; window.location.reload(); }
  }
  return (
    <div className="space-y-5 text-sm" data-testid="tools-admin">
      <Msg error={error} done={done} />
      <section className="space-y-2">
        <h4 className="font-semibold">Etiquetas prontas</h4>
        <p className="text-xs text-muted">Cria de uma vez um conjunto de etiquetas (as que já existem não são repetidas).</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => presetLabelsAction("area"), "Etiquetas por área criadas.")}>Por área do direito</Button>
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => presetLabelsAction("origem"), "Etiquetas por origem criadas.")}>Por origem do contato</Button>
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => presetLabelsAction("responsavel"), "Etiquetas por responsável criadas.")}>Por responsável</Button>
        </div>
      </section>
      <section className="space-y-2">
        <h4 className="font-semibold">Status do chat</h4>
        <p className="text-xs text-muted">Etapa do atendimento (ex.: Aguardando documentos, Em análise). Aparece na conversa e no relatório.</p>
        <ul className="space-y-1">{d.statuses.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1"><span><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: s.color }} />{s.name}</span><Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => deleteChatStatusAction(s.id), "Status removido.")}>Remover</Button></li>)}</ul>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Novo status" htmlFor="st-name"><Input id="st-name" maxLength={40} value={st.name} onChange={(e) => setSt({ ...st, name: e.target.value })} /></Field>
          <Field label="Cor" htmlFor="st-color"><Input id="st-color" type="color" value={st.color} onChange={(e) => setSt({ ...st, color: e.target.value })} /></Field>
          <Button size="sm" loading={pending} disabled={!st.name.trim()} onClick={() => run(() => saveChatStatusAction(null, st), "Status criado.", () => setSt({ name: "", color: st.color }))}>Criar</Button>
        </div>
      </section>
      <section className="space-y-2">
        <h4 className="font-semibold">Checklists enviáveis</h4>
        <p className="text-xs text-muted">Lista de itens (ex.: documentos para o INSS) que o atendente envia ao cliente com um clique.</p>
        <ul className="space-y-1">{d.checklists.map((c) => <li key={c.id} className="flex items-start justify-between gap-2 rounded border border-border px-2 py-1"><span><span className="font-medium">{c.title}</span> · {c.items.length} itens</span><Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => deleteChecklistAction(c.id), "Checklist removida.")}>Remover</Button></li>)}</ul>
        <Field label="Título" htmlFor="ck-t"><Input id="ck-t" maxLength={80} value={ck.title} onChange={(e) => setCk({ ...ck, title: e.target.value })} /></Field>
        <Field label="Itens (um por linha)" htmlFor="ck-i"><Textarea id="ck-i" rows={4} value={ck.items} onChange={(e) => setCk({ ...ck, items: e.target.value })} /></Field>
        <Button size="sm" loading={pending} disabled={!ck.title.trim() || !ck.items.trim()} onClick={() => run(() => saveChecklistAction(null, { title: ck.title, items: ck.items.split("\n").map((x) => x.trim()).filter(Boolean) }), "Checklist criada.", () => setCk({ title: "", items: "" }))}>Criar checklist</Button>
      </section>
      <section className="space-y-2">
        <h4 className="font-semibold">Biblioteca de arquivos</h4>
        <p className="text-xs text-muted">Modelos prontos (procuração, contrato, lista de documentos em PDF) para enviar ao cliente.</p>
        {lib.err ? <Alert tone="error">{lib.err}</Alert> : lib.msg ? <Alert tone="success">{lib.msg}</Alert> : null}
        <ul className="space-y-1">{d.library.map((f) => <li key={f.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1"><span>{f.title} <span className="text-xs text-muted">({f.fileName}, {(f.sizeBytes / 1024).toFixed(0)} KB)</span></span><Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => deleteLibraryFileAction(f.id), "Arquivo removido.")}>Remover</Button></li>)}</ul>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Título" htmlFor="lib-t"><Input id="lib-t" maxLength={80} value={lib.title} onChange={(e) => setLib({ ...lib, title: e.target.value })} /></Field>
          <input ref={fileRef} type="file" aria-label="Arquivo da biblioteca" className="text-xs" />
          <Button size="sm" loading={lib.busy} disabled={!lib.title.trim()} onClick={() => void upload()}>Guardar arquivo</Button>
        </div>
      </section>
    </div>
  );
}

// ======================= chaves novas =======================
export type ExtrasFlags = { archiveEnabled: boolean; archiveDays: number; npsAutoOnClose: boolean; campaignsEnabled: boolean; delegateEnabled: boolean; intentsEnabled: boolean; transcribeEnabled: boolean };

export function Extras40Switches({ s }: { s: ExtrasFlags }) {
  const { run, pending, error, done } = useRun();
  const [days, setDays] = React.useState(String(s.archiveDays));
  const row = (title: string, desc: string, on: boolean, key: keyof Omit<ExtrasFlags, "archiveDays">) => (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
      <div className="min-w-0"><div className="font-medium">{title} <Badge tone={on ? "success" : "neutral"}>{on ? "Ligada" : "Desligada"}</Badge></div><p className="text-xs text-muted">{desc}</p></div>
      <Button size="sm" variant={on ? "secondary" : "primary"} loading={pending} onClick={() => run(() => setExtrasSettingsAction({ [key]: !on }), on ? "Desligado." : "Ligado.")}>{on ? "Desligar" : "Ligar"}</Button>
    </li>
  );
  return (
    <div className="space-y-3" data-testid="extras40-switches">
      <Msg error={error} done={done} />
      <ul className="divide-y divide-border rounded-md border border-border">
        {row("Encerrar conversas paradas", "Encerra (sem escrever ao cliente) conversas sem mensagem há alguns dias. Conversas com retorno combinado não são encerradas.", s.archiveEnabled, "archiveEnabled")}
        {row("Pesquisa de satisfação ao encerrar", "Ao encerrar uma conversa, envia a pergunta de nota (precisa da pesquisa de satisfação ligada).", s.npsAutoOnClose, "npsAutoOnClose")}
        {row("Entregar ao advogado responsável", "Conversa de cliente sem responsável vai para o advogado responsável pelo processo ativo dele.", s.delegateEnabled, "delegateEnabled")}
        {row("Intenções do robô (pontuação)", "Reconhece o assunto pelas palavras e executa as ações das intenções ativas.", s.intentsEnabled, "intentsEnabled")}
        {row("Campanhas em massa", "Permite criar campanhas. Mesmo ligada, nada sai sem uma pessoa APROVAR cada campanha.", s.campaignsEnabled, "campaignsEnabled")}
        {row("Transcrição de áudio (Gemini)", "Botão “Transcrever” nos áudios. O áudio é enviado ao Google e cada transcrição consome créditos.", s.transcribeEnabled, "transcribeEnabled")}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Encerrar após quantos dias sem mensagem" htmlFor="arch-days"><Input id="arch-days" inputMode="numeric" className="w-24" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></Field>
        <Button size="sm" loading={pending} onClick={() => run(() => setExtrasSettingsAction({ archiveDays: Number(days) }), "Salvo.")}>Salvar dias</Button>
      </div>
    </div>
  );
}

// ======================= diálogos do robô =======================
export type DialogRow = { id: string; kind: string; name: string; active: boolean; text: string; templateId: string | null; config: Record<string, unknown> };
export type RunRow = { id: string; status: string; message: string | null; createdAt: string };
const KIND_LABEL: Record<string, string> = { TIMER: "Reenviar se o cliente não responder", BIRTHDAY: "Parabéns no aniversário", HEARING: "Aviso de audiência ou perícia", HOURS: "Responder sobre o horário" };
const KIND_HELP: Record<string, string> = {
  TIMER: "Depois de X minutos sem resposta do cliente, envia um lembrete. Variáveis: {nome}.",
  BIRTHDAY: "No dia do aniversário cadastrado. Variáveis: {nome}.",
  HEARING: "Dias antes de uma audiência/perícia da Agenda ligada ao cliente. Variáveis: {nome} {titulo} {data} {hora} {local}.",
  HOURS: "Quando o cliente pergunta pelo horário. Usa o texto abaixo se estiver aberto e o texto de fechado se não. Variáveis: {nome}.",
};

export function DialogsPanel({ dialogs, templates, runs }: { dialogs: DialogRow[]; templates: { id: string; name: string }[]; runs: RunRow[] }) {
  const { run, pending, error, done } = useRun();
  const [kind, setKind] = React.useState("BIRTHDAY");
  const [f, setF] = React.useState({ name: "", text: "", templateId: "", minutes: "60", hour: "9", days: "1", keywords: "horário, funcionamento, aberto", closed: "" });
  const config = () => kind === "TIMER" ? { minutes: Number(f.minutes) } : kind === "BIRTHDAY" ? { sendHour: Number(f.hour) } : kind === "HEARING" ? { daysBefore: Number(f.days), sendHour: Number(f.hour) } : { keywords: f.keywords, closedText: f.closed };
  return (
    <div className="space-y-3 text-sm" data-testid="dialogs-panel">
      <Msg error={error} done={done} />
      <Alert tone="info">Cada diálogo nasce desligado. Quem pediu para não receber mensagens automáticas (“PARAR”) nunca recebe. Fora da janela de 24 h só vai modelo aprovado; sem modelo, o envio é registrado como “ignorado”.</Alert>
      <ul className="divide-y divide-border rounded-md border border-border">
        {dialogs.length === 0 ? <li className="p-3 text-muted">Nenhum diálogo criado.</li> : null}
        {dialogs.map((d) => (
          <li key={d.id} className="space-y-1 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><span className="font-medium">{d.name}</span> <Badge tone={d.active ? "success" : "neutral"}>{d.active ? "Ligado" : "Desligado"}</Badge><div className="text-xs text-muted">{KIND_LABEL[d.kind] ?? d.kind}</div></div>
              <div className="flex gap-2">
                <Button size="sm" variant={d.active ? "secondary" : "primary"} loading={pending} onClick={() => run(() => setDialogActiveAction(d.id, !d.active), d.active ? "Desligado." : "Ligado.")}>{d.active ? "Desligar" : "Ligar"}</Button>
                <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => deleteDialogAction(d.id), "Removido.")}>Remover</Button>
              </div>
            </div>
            <p className="line-clamp-2 text-xs">{d.text}</p>
          </li>
        ))}
      </ul>
      <div className="space-y-2 rounded-md border border-border p-3">
        <h4 className="font-semibold">Novo diálogo</h4>
        <Field label="Tipo" htmlFor="dl-kind"><Select id="dl-kind" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <p className="text-xs text-muted">{KIND_HELP[kind]}</p>
        <Field label="Nome" htmlFor="dl-name"><Input id="dl-name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        {kind === "TIMER" ? <Field label="Minutos sem resposta (5 a 10080)" htmlFor="dl-min"><Input id="dl-min" inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value.replace(/\D/g, "") })} /></Field> : null}
        {kind === "BIRTHDAY" || kind === "HEARING" ? <Field label="A partir de que hora enviar (0 a 23)" htmlFor="dl-hour"><Input id="dl-hour" inputMode="numeric" value={f.hour} onChange={(e) => setF({ ...f, hour: e.target.value.replace(/\D/g, "") })} /></Field> : null}
        {kind === "HEARING" ? <Field label="Quantos dias antes (0 a 30)" htmlFor="dl-days"><Input id="dl-days" inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value.replace(/\D/g, "") })} /></Field> : null}
        {kind === "HOURS" ? <Field label="Palavras que acionam (separadas por vírgula)" htmlFor="dl-kw"><Input id="dl-kw" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></Field> : null}
        <Field label={kind === "HOURS" ? "Resposta quando estiver ABERTO" : "Mensagem"} htmlFor="dl-text"><Textarea id="dl-text" rows={3} maxLength={1000} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
        {kind === "HOURS" ? <Field label="Resposta quando estiver FECHADO" htmlFor="dl-closed"><Textarea id="dl-closed" rows={3} maxLength={1000} value={f.closed} onChange={(e) => setF({ ...f, closed: e.target.value })} /></Field> : null}
        {kind !== "HOURS" ? <Field label="Modelo aprovado (para fora da janela de 24 h)" htmlFor="dl-tpl"><Select id="dl-tpl" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}><option value="">Sem modelo (só dentro da janela)</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field> : null}
        <Button size="sm" loading={pending} disabled={!f.name.trim() || !f.text.trim()} onClick={() => run(() => saveDialogAction(null, { kind, name: f.name, text: f.text, templateId: f.templateId || null, config: config() }), "Diálogo criado (desligado). Ligue quando quiser.", () => setF({ ...f, name: "", text: "", closed: "" }))}>Criar diálogo</Button>
      </div>
      {runs.length ? (
        <details><summary className="cursor-pointer text-xs text-muted">Últimos envios dos diálogos</summary>
          <ul className="mt-1 space-y-1 text-xs">{runs.map((r) => <li key={r.id}>{fmt(r.createdAt)} · <Badge tone={r.status === "SENT" ? "success" : r.status === "FAILED" ? "danger" : "neutral"}>{({ SENT: "Enviado", SKIPPED: "Ignorado", FAILED: "Falhou", SENDING: "Enviando" } as Record<string, string>)[r.status] ?? r.status}</Badge> {r.message ?? ""}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

// ======================= intenções =======================
export type IntentRow = { id: string; name: string; active: boolean; threshold: number; terms: { term: string; weight: number }[]; actionsCount: number };

export function IntentsPanel({ intents, labels, agents, queues }: { intents: IntentRow[]; labels: { id: string; name: string }[]; agents: { id: string; name: string }[]; queues: { id: string; name: string }[] }) {
  const { run, pending, error, done } = useRun();
  const [f, setF] = React.useState({ name: "", terms: "", threshold: "4", act: "ADD_LABEL", target: "", reply: "" });
  const [test, setTest] = React.useState({ text: "", rows: [] as { name: string; score: number; threshold: number; active: boolean }[] });
  const targets = f.act === "ADD_LABEL" ? labels : f.act === "NOTIFY" || f.act === "ASSIGN" ? agents : f.act === "TRANSFER_QUEUE" ? queues : [];
  const parseTerms = () => f.terms.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [t, w] = l.split(":"); return { term: (t ?? "").trim(), weight: Number((w ?? "1").trim()) || 1 }; });
  const action = () => f.act === "SEND_REPLY" ? { type: "SEND_REPLY", text: f.reply } : f.act === "ADD_LABEL" ? { type: "ADD_LABEL", labelId: f.target } : f.act === "TRANSFER_QUEUE" ? { type: "TRANSFER_QUEUE", queueId: f.target } : f.act === "ASSIGN" ? { type: "ASSIGN", userId: f.target } : { type: "NOTIFY", userId: f.target };
  return (
    <div className="space-y-3 text-sm" data-testid="intents-panel">
      <Msg error={error} done={done} />
      <Alert tone="info">Sem IA: cada palavra vale pontos. Se a soma da mensagem do cliente chegar ao mínimo, a intenção de maior pontuação executa as ações. Precisa da chave “Intenções do robô” ligada, e cada intenção nasce desligada.</Alert>
      <ul className="divide-y divide-border rounded-md border border-border">
        {intents.length === 0 ? <li className="p-3 text-muted">Nenhuma intenção criada.</li> : null}
        {intents.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div><span className="font-medium">{i.name}</span> <Badge tone={i.active ? "success" : "neutral"}>{i.active ? "Ligada" : "Desligada"}</Badge><div className="text-xs text-muted">Mínimo {i.threshold} pontos · {i.terms.map((t) => `${t.term} (${t.weight})`).join(", ")}</div></div>
            <div className="flex gap-2">
              <Button size="sm" variant={i.active ? "secondary" : "primary"} loading={pending} onClick={() => run(() => setIntentActiveAction(i.id, !i.active), i.active ? "Desligada." : "Ligada.")}>{i.active ? "Desligar" : "Ligar"}</Button>
              <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => deleteIntentAction(i.id), "Removida.")}>Remover</Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="space-y-2 rounded-md border border-border p-3">
        <h4 className="font-semibold">Nova intenção</h4>
        <Field label="Nome" htmlFor="in-name"><Input id="in-name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Palavras e pontos (uma por linha, ex.: audiência:3)" htmlFor="in-terms"><Textarea id="in-terms" rows={4} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
        <Field label="Pontuação mínima" htmlFor="in-th"><Input id="in-th" inputMode="numeric" className="w-24" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="O que fazer" htmlFor="in-act"><Select id="in-act" value={f.act} onChange={(e) => setF({ ...f, act: e.target.value, target: "" })}>
          <option value="ADD_LABEL">Colocar etiqueta</option><option value="NOTIFY">Avisar um membro da equipe</option><option value="ASSIGN">Atribuir a um atendente</option><option value="TRANSFER_QUEUE">Mandar para uma fila</option><option value="SEND_REPLY">Responder ao cliente</option></Select></Field>
        {f.act === "SEND_REPLY" ? <Field label="Resposta" htmlFor="in-reply"><Textarea id="in-reply" rows={2} maxLength={1000} value={f.reply} onChange={(e) => setF({ ...f, reply: e.target.value })} /></Field> : (
          <Field label="Qual" htmlFor="in-target"><Select id="in-target" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}><option value="">Escolha…</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        )}
        <Button size="sm" loading={pending} disabled={!f.name.trim() || !f.terms.trim() || (f.act === "SEND_REPLY" ? !f.reply.trim() : !f.target)} onClick={() => run(() => saveIntentAction(null, { name: f.name, terms: parseTerms(), threshold: Number(f.threshold) || 1, actions: [action()] }), "Intenção criada (desligada).", () => setF({ ...f, name: "", terms: "", reply: "" }))}>Criar intenção</Button>
      </div>
      <div className="space-y-2 rounded-md border border-border p-3">
        <h4 className="font-semibold">Testar uma frase</h4>
        <Input aria-label="Frase de teste" placeholder="Ex.: qual a data da minha audiência?" value={test.text} onChange={(e) => setTest({ ...test, text: e.target.value })} />
        <Button size="sm" variant="secondary" disabled={!test.text.trim()} onClick={async () => { const r = await testIntentsAction(test.text); if (r.ok && r.data) setTest((t) => ({ ...t, rows: r.data!.rows })); }}>Ver pontuação (não executa nada)</Button>
        {test.rows.length ? <ul className="text-xs">{test.rows.map((r, i) => <li key={i}>{r.name}: {r.score} ponto(s) — {r.score >= r.threshold ? <strong>acionaria</strong> : "não aciona"}{r.active ? "" : " (desligada)"}</li>)}</ul> : null}
      </div>
    </div>
  );
}

// ======================= campanhas =======================
export type CampaignRow = { id: string; name: string; status: string; text: string; createdAt: string; counts: { PENDING: number; SENT: number; FAILED: number; SKIPPED: number; UNKNOWN?:number } };
const CSTATUS: Record<string, string> = { DRAFT: "Rascunho (aguardando aprovação)", APPROVED: "Aprovada (na fila)", SENDING: "Enviando", PAUSED: "Pausada", DONE: "Concluída", CANCELED: "Cancelada" };

export function CampaignsPanel({ campaigns, clients, templates, enabled, canApprove, isMeta }: { campaigns: CampaignRow[]; clients: { id: string; name: string }[]; templates: { id: string; name: string }[]; enabled: boolean; canApprove: boolean; isMeta: boolean }) {
  const { run, pending, error, done } = useRun();
  const [f, setF] = React.useState({ name: "", text: "", templateId: "", q: "" });
  const [clientTag,setClientTag]=React.useState("");
  const [clientStatus,setClientStatus]=React.useState("");
  const [schedule,setSchedule]=React.useState("");
  const [importText,setImportText]=React.useState("");
  const [importConsent,setImportConsent]=React.useState(false);
  let imported:{name:string;phone:string}[]=[];let importError="";try{imported=parseCampaignContacts(importText);}catch(e){importError=e instanceof Error?e.message:"Lista inválida.";}
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [rep, setRep] = React.useState<{ id: string; rows: { name: string; status: string; error: string | null }[];page:number;pages:number;total:number } | null>(null);
  const [page,setPage]=React.useState(1);const [clientError,setClientError]=React.useState("");const [loadingClients,setLoadingClients]=React.useState(true);
  const [options,setOptions]=React.useState({items:clients,total:clients.length,pages:1});const [matching,setMatching]=React.useState<{q:string;total:number;clientTag:string;clientStatus:string}|null>(null);
  React.useEffect(()=>{let alive=true;const timer=setTimeout(async()=>{setLoadingClients(true);const r=await campaignClientOptionsAction({q:f.q,page,clientTag,clientStatus:clientStatus||undefined});if(!alive)return;setLoadingClients(false);if(r.ok&&r.data){setOptions(r.data);setClientError("");}else setClientError(r.message??"Não foi possível buscar clientes.");},250);return()=>{alive=false;clearTimeout(timer);};},[f.q,page,clientTag,clientStatus]);
  const shown=options.items;
  const reportPage=async(id:string,page:number)=>{const r=await campaignReportAction(id,page);if(r.ok&&r.data)setRep({id,...r.data});};
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="space-y-3 text-sm" data-testid="campaigns-panel">
      <Msg error={error} done={done} />
      <Alert tone="warning">Campanha em massa só sai depois que uma pessoa com permissão APROVA. O envio é gradual (poucos por minuto), até 10.000 clientes por campanha, e quem pediu para parar nunca recebe. Use com responsabilidade: mensagens em massa podem gerar bloqueios do WhatsApp.</Alert>
      {!enabled ? <Alert tone="info">As campanhas estão desligadas. Ligue a chave “Campanhas em massa” acima para criar.</Alert> : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {campaigns.length === 0 ? <li className="p-3 text-muted">Nenhuma campanha.</li> : null}
        {campaigns.map((c) => (
          <li key={c.id} className="space-y-1 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><span className="font-medium">{c.name}</span> <Badge tone={c.status === "DONE" ? "success" : c.status === "DRAFT" ? "warning" : "info"}>{CSTATUS[c.status] ?? c.status}</Badge>
                <div className="text-xs text-muted">{fmt(c.createdAt)} · enviadas {c.counts.SENT} · na fila {c.counts.PENDING} · falhas {c.counts.FAILED} · ignoradas {c.counts.SKIPPED} · envio incerto {c.counts.UNKNOWN??0}</div></div>
              <div className="flex flex-wrap gap-2">
                {(c.status === "DRAFT" || c.status === "PAUSED") && canApprove ? <Button size="sm" loading={pending} onClick={() => run(() => approveCampaignAction(c.id), "Campanha aprovada. O envio respeita o horário agendado e acontece aos poucos.")}>Aprovar e enviar</Button> : null}
                {c.status === "APPROVED" || c.status === "SENDING" ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => pauseCampaignAction(c.id), "Campanha pausada.")}>Pausar</Button> : null}
                {["DRAFT", "APPROVED", "SENDING", "PAUSED"].includes(c.status) ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => cancelCampaignAction(c.id), "Campanha cancelada.")}>Cancelar</Button> : null}
                <Button size="sm" variant="secondary" onClick={async () => { const r = await campaignReportAction(c.id); if (r.ok && r.data) setRep({ id: c.id,...r.data }); }}>Relatório</Button>
              </div>
            </div>
            <p className="line-clamp-2 text-xs">{c.text}</p>
            {rep?.id===c.id?<div className="flex items-center gap-2 text-xs"><Button size="sm" disabled={rep.page<=1} onClick={()=>reportPage(c.id,rep.page-1)}>Anterior</Button><span>Relatório: {rep.page}/{rep.pages} · {rep.total} destinatários</span><Button size="sm" disabled={rep.page>=rep.pages} onClick={()=>reportPage(c.id,rep.page+1)}>Próxima</Button></div>:null}
            {rep?.id === c.id ? <ul className="max-h-48 overflow-y-auto rounded border border-border p-2 text-xs">{rep.rows.map((r, i) => <li key={i}>{r.name}: {({ SENT: "enviada", PENDING: "na fila", FAILED: "falhou", SKIPPED: "ignorada", SENDING: "enviando", UNKNOWN:"envio incerto — conferir antes de repetir" } as Record<string, string>)[r.status] ?? r.status}{r.error ? ` — ${r.error}` : ""}</li>)}</ul> : null}
          </li>
        ))}
      </ul>
      {enabled ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <h4 className="font-semibold">Nova campanha</h4>
          <Field label="Nome (só para vocês)" htmlFor="cp-name"><Input id="cp-name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Mensagem (use {nome})" htmlFor="cp-text"><Textarea id="cp-text" rows={4} maxLength={1000} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
          <Field label={isMeta ? "Modelo aprovado (obrigatório na API oficial)" : "Modelo aprovado (opcional)"} htmlFor="cp-tpl"><Select id="cp-tpl" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}><option value="">{isMeta ? "Escolha…" : "Sem modelo"}</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Agendar envio (horário deste navegador; ainda exige aprovação)" htmlFor="cp-schedule"><Input id="cp-schedule" type="datetime-local" value={schedule} onChange={e=>setSchedule(e.target.value)}/></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Etiqueta do cadastro do cliente (nome exato)" htmlFor="cp-tag"><Input id="cp-tag" value={clientTag} onChange={e=>{setClientTag(e.target.value);setLoadingClients(true);setPage(1);setMatching(null);}} maxLength={80}/></Field><Field label="Situação do cliente" htmlFor="cp-client-status"><Select id="cp-client-status" value={clientStatus} onChange={e=>{setClientStatus(e.target.value);setLoadingClients(true);setPage(1);setMatching(null);}}><option value="">Todas</option><option value="ACTIVE">Ativo</option><option value="PROSPECT">Prospect</option><option value="INACTIVE">Inativo</option></Select></Field></div>
          <details><summary className="cursor-pointer text-sm">Importar lista de destinatários</summary><Field label="Uma linha por contato: Nome;Telefone com DDI" htmlFor="cp-import"><Textarea id="cp-import" rows={5} maxLength={1000000} value={importText} onChange={e=>{setImportText(e.target.value);setMatching(null);setImportConsent(false);}}/></Field><p className="text-xs text-muted">{imported.length} telefones únicos. Não cria clientes no cadastro. Pedidos de parada continuam respeitados.</p>{importError&&<Alert tone="error">{importError}</Alert>}<label className="text-sm"><input type="checkbox" checked={importConsent} onChange={e=>setImportConsent(e.target.checked)}/> Conferi a origem e a autorização para contatar estas pessoas.</label></details>
          <Field label="Buscar cliente" htmlFor="cp-q"><Input id="cp-q" value={f.q} onChange={(e) => {setLoadingClients(true);setF({ ...f, q: e.target.value });setPage(1);setMatching(null);}} /></Field>
          {clientError?<Alert tone="error">{clientError}</Alert>:null}
          <div className="flex items-center gap-2"><Button size="sm" disabled={page<=1||loadingClients} onClick={()=>setPage(p=>p-1)}>Página anterior</Button><span className="text-xs">{page}/{options.pages} · {options.total} clientes no filtro</span><Button size="sm" disabled={page>=options.pages||loadingClients} onClick={()=>setPage(p=>p+1)}>Próxima página</Button></div>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-border p-2">
            {shown.map((c) => <label key={c.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!matching||sel.has(c.id)} disabled={!!matching||loadingClients} onChange={() => toggle(c.id)} />{c.name}</label>)}
            {shown.length === 0 ? <p className="text-xs text-muted">Nenhum cliente com telefone encontrado.</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={loadingClients||!!matching} onClick={() => setSel(new Set([...sel, ...shown.map((c) => c.id)]))}>Marcar os exibidos</Button>
            <Button size="sm" variant="secondary" disabled={loadingClients||options.total>10000||!options.total} onClick={()=>{setMatching({q:f.q,total:options.total,clientTag,clientStatus});setSel(new Set());}}>Selecionar todos do filtro</Button>
            <Button size="sm" variant="secondary" onClick={() => {setSel(new Set());setMatching(null);}}>Limpar</Button>
            <span className="text-xs text-muted">{matching?.total??sel.size} selecionado(s){matching?" — todos os clientes do filtro":""}</span>
          </div>
          <Button size="sm" loading={pending} disabled={!f.name.trim() || !f.text.trim() || (sel.size === 0&&!matching&&!imported.length)||!!importError||(!!imported.length&&!importConsent)||loadingClients||!!clientError||sel.size>10000} onClick={() => run(() => createCampaignAction({ name: f.name, text: f.text, templateId: f.templateId || null, clientIds: [...sel],allMatching:!!matching,query:matching?.q??"",clientTag:matching?.clientTag??"",clientStatus:matching?.clientStatus||undefined,scheduledAt:schedule?new Date(schedule).toISOString():null,imported,importConsent }), "Campanha criada como rascunho. Falta a aprovação.", () => { setF({ name: "", text: "", templateId: "", q: "" }); setSel(new Set());setMatching(null);setImportText("");setImportConsent(false);setSchedule(""); })}>Criar rascunho</Button>
        </div>
      ) : null}
    </div>
  );
}

// ======================= resumo agendado por e-mail =======================
export function ReportSchedulePanel({ s }: { s: { enabled: boolean; frequency: string; recipients: string[]; lastSentAt: string | null } }) {
  const { run, pending, error, done } = useRun();
  const [f, setF] = React.useState({ enabled: s.enabled, frequency: s.frequency, recipients: s.recipients.join(", ") });
  return (
    <div className="space-y-2 text-sm" data-testid="report-schedule">
      <Msg error={error} done={done} />
      <p className="text-xs text-muted">Envia por e-mail um resumo com números do período anterior (sem nomes de clientes nem conteúdo de conversas). Precisa do envio de e-mail configurado no sistema.{s.lastSentAt ? ` Último envio: ${fmt(s.lastSentAt)}.` : ""}</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Enviar resumo automaticamente</label>
      <Field label="Frequência" htmlFor="rs-f"><Select id="rs-f" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option value="DAILY">Todo dia</option><option value="WEEKLY">Toda segunda-feira</option><option value="MONTHLY">Todo dia 1º do mês</option></Select></Field>
      <Field label="E-mails (separados por vírgula, até 10)" htmlFor="rs-r"><Input id="rs-r" value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} /></Field>
      <Button size="sm" loading={pending} onClick={() => run(() => saveReportScheduleAction({ enabled: f.enabled, frequency: f.frequency, recipients: f.recipients.split(/[,;\s]+/).filter(Boolean) }), "Salvo.")}>Salvar</Button>
    </div>
  );
}

// ======================= segurança da conta =======================
export function SecurityPanel({ s, sessions }: { s: { ipAllowlist: string[]; ipEnforced: boolean; idleLogoutMinutes: number | null; yourIp: string | null }; sessions: { id: string; userName: string; ipAddress: string | null; userAgent: string | null; lastSeenAt: string }[] }) {
  const { run, pending, error, done } = useRun();
  const [f, setF] = React.useState({ ips: s.ipAllowlist.join("\n"), enforced: s.ipEnforced, idle: s.idleLogoutMinutes ? String(s.idleLogoutMinutes) : "" });
  return (
    <div className="space-y-4 text-sm" data-testid="security-panel">
      <Msg error={error} done={done} />
      <section className="space-y-2">
        <h4 className="font-semibold">Acesso só de endereços autorizados (IP)</h4>
        <p className="text-xs text-muted">Seu endereço atual: <strong>{s.yourIp ?? "desconhecido"}</strong>. Só dá para ligar com o seu endereço na lista (para você não perder o acesso). Se mesmo assim ficar bloqueado, o suporte da plataforma desliga a restrição.</p>
        <Field label="Endereços ou faixas permitidos (um por linha, ex.: 200.10.0.5 ou 200.10.0.0/24)" htmlFor="sec-ips"><Textarea id="sec-ips" rows={4} value={f.ips} onChange={(e) => setF({ ...f, ips: e.target.value })} /></Field>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.enforced} onChange={(e) => setF({ ...f, enforced: e.target.checked })} /> Bloquear acessos fora da lista</label>
      </section>
      <section className="space-y-2">
        <h4 className="font-semibold">Sair sozinho por inatividade</h4>
        <Field label="Minutos sem usar o sistema (10 a 1440; vazio = nunca)" htmlFor="sec-idle"><Input id="sec-idle" inputMode="numeric" className="w-28" value={f.idle} onChange={(e) => setF({ ...f, idle: e.target.value.replace(/\D/g, "") })} /></Field>
      </section>
      <Button loading={pending} onClick={() => run(() => saveSecurityAction({ ipAllowlist: f.ips.split("\n").map((x) => x.trim()).filter(Boolean), ipEnforced: f.enforced, idleLogoutMinutes: f.idle ? Number(f.idle) : null }), "Segurança salva.")}>Salvar segurança</Button>
      <section className="space-y-2">
        <h4 className="font-semibold">Sessões ativas da equipe</h4>
        <ul className="divide-y divide-border rounded-md border border-border">
          {sessions.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
              <span><strong>{x.userName}</strong> · IP {x.ipAddress ?? "—"} · último uso {fmt(x.lastSeenAt)}<br /><span className="text-muted">{(x.userAgent ?? "").slice(0, 90)}</span></span>
              <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => revokeOrgSessionAction(x.id), "Sessão encerrada.")}>Encerrar</Button>
            </li>
          ))}
          {sessions.length === 0 ? <li className="p-2 text-muted">Nenhuma sessão ativa.</li> : null}
        </ul>
      </section>
    </div>
  );
}

// ======================= dentro da conversa =======================
export type ConvToolsData = {
  conversationId: string;
  canWrite: boolean;
  statusId: string | null;
  statuses: { id: string; name: string; color: string }[];
  checklists: { id: string; title: string }[];
  library: { id: string; title: string }[];
  forwardable: { id: string; label: string }[]; // últimas mensagens desta conversa
  others: { id: string; name: string }[]; // outras conversas abertas
};

export function ConversationTools({ d }: { d: ConvToolsData }) {
  const { run, pending, error, done } = useRun();
  const [lib, setLib] = React.useState("");
  const [ck, setCk] = React.useState("");
  const [fm, setFm] = React.useState("");
  const [targets, setTargets] = React.useState<Set<string>>(new Set());
  const [fwdMsg, setFwdMsg] = React.useState<string | null>(null);
  const toggle = (id: string) => setTargets((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < 10) n.add(id); return n; });
  return (
    <div className="space-y-3 border-t border-border p-3 text-xs" data-testid="conv-tools">
      <Msg error={error} done={done} />
      {d.statuses.length ? (
        <section className="space-y-1">
          <h4 className="font-semibold uppercase tracking-wide text-primary-text">Status do chat</h4>
          <Select aria-label="Status do chat" value={d.statusId ?? ""} disabled={!d.canWrite || pending} onChange={(e) => run(() => setChatStatusAction(d.conversationId, e.target.value || null), "Status atualizado.")}>
            <option value="">Sem status</option>{d.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </section>
      ) : null}
      {d.canWrite && d.library.length ? (
        <section className="space-y-1">
          <h4 className="font-semibold uppercase tracking-wide text-primary-text">Enviar arquivo da biblioteca</h4>
          <Select aria-label="Arquivo da biblioteca" value={lib} onChange={(e) => setLib(e.target.value)}><option value="">Escolha…</option>{d.library.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</Select>
          <Button size="sm" loading={pending} disabled={!lib} onClick={() => run(() => sendLibraryFileAction(d.conversationId, lib), "Arquivo enviado.", () => setLib(""))}>Enviar</Button>
        </section>
      ) : null}
      {d.canWrite && d.checklists.length ? (
        <section className="space-y-1">
          <h4 className="font-semibold uppercase tracking-wide text-primary-text">Enviar checklist</h4>
          <Select aria-label="Checklist" value={ck} onChange={(e) => setCk(e.target.value)}><option value="">Escolha…</option>{d.checklists.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
          <Button size="sm" loading={pending} disabled={!ck} onClick={() => run(() => sendChecklistAction(d.conversationId, ck), "Checklist enviada.", () => setCk(""))}>Enviar</Button>
        </section>
      ) : null}
      {d.canWrite && d.forwardable.length && d.others.length ? (
        <details className="space-y-1">
          <summary className="cursor-pointer font-semibold uppercase tracking-wide text-primary-text">Encaminhar mensagem a outros chats</summary>
          <Select aria-label="Mensagem a encaminhar" value={fm} onChange={(e) => setFm(e.target.value)}><option value="">Escolha a mensagem…</option>{d.forwardable.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded border border-border p-1.5">{d.others.map((o) => <label key={o.id} className="flex items-center gap-2"><input type="checkbox" checked={targets.has(o.id)} onChange={() => toggle(o.id)} />{o.name}</label>)}</div>
          <Button size="sm" loading={pending} disabled={!fm || targets.size === 0} onClick={() => run(() => forwardMessageAction(fm, [...targets]), undefined, (r) => { const ok = r?.results.filter((x) => x.ok).length ?? 0; const bad = (r?.results.length ?? 0) - ok; setFwdMsg(`Encaminhada para ${ok} chat(s)${bad ? `; ${bad} falharam (janela de 24 h fechada ou outro motivo).` : "."}`); setTargets(new Set()); })}>Encaminhar ({targets.size})</Button>
          {fwdMsg ? <p role="status">{fwdMsg}</p> : null}
          <p className="text-muted">Até 10 chats por vez. Respeita a janela de 24 h de cada conversa.</p>
        </details>
      ) : null}
    </div>
  );
}

// ======================= áudio =======================
export function TranscribeButton({ messageId, initial, enabled }: { messageId: string; initial: string | null; enabled: boolean }) {
  const [text, setText] = React.useState<string | null>(initial);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  if (text) return <p className="mt-1 whitespace-pre-wrap rounded border border-border/60 bg-surface/60 p-1.5 text-xs" data-testid="audio-transcript"><span className="font-semibold">Transcrição:</span> {text}</p>;
  if (!enabled) return null;
  return (
    <div className="mt-1">
      <button type="button" disabled={busy} className="text-xs underline disabled:opacity-50" onClick={async () => { setBusy(true); setErr(null); const r = await transcribeAction(messageId); setBusy(false); if (r.ok && r.data) setText(r.data.text); else setErr(r.message ?? "Não foi possível transcrever."); }}>{busy ? "Transcrevendo…" : "Transcrever áudio"}</button>
      {err ? <p className="text-xs text-danger">{err}</p> : null}
    </div>
  );
}
