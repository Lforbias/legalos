"use client";
import * as React from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { createDictation, type Dictation, type Recognition } from "@/lib/ai/browser-voice";
const subscribe = () => () => {};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function VoiceInput({ disabled, onTranscript }: { disabled: boolean; onTranscript: (text: string) => void }) {
  const supported = React.useSyncExternalStore(subscribe, () => { const w=window as VoiceWindow; return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition); }, () => false);
  const [consent, setConsent] = React.useState(false), [listening, setListening] = React.useState(false), [error, setError] = React.useState("");
  const recognition = React.useRef<Dictation | null>(null);
  React.useEffect(() => { const stop = () => { recognition.current?.abort(); window.speechSynthesis?.cancel(); };
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener("rute:voice-output",stop); document.addEventListener("visibilitychange",visibility); document.addEventListener("close",stop,true); window.addEventListener("pagehide",stop);
    return () => { stop(); document.removeEventListener("rute:voice-output",stop); document.removeEventListener("visibilitychange",visibility); document.removeEventListener("close",stop,true); window.removeEventListener("pagehide",stop); }; }, []);
  React.useEffect(() => { if (disabled) recognition.current?.abort(); }, [disabled]);
  function start() {
    if (!consent || disabled) return;
    const w = window as VoiceWindow, Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) return;
    window.speechSynthesis?.cancel();
    recognition.current?.abort();
    const r = createDictation(Constructor, {
      onTranscript,
      onError: error => { setListening(false); setError(error === "not-allowed" ? "Permissão de microfone negada. Você pode continuar digitando." : "Não foi possível reconhecer a fala. Tente novamente ou digite."); },
      onEnd: () => setListening(false),
    });
    recognition.current = r;
    try { setError(""); r.start(); setListening(true); } catch { setError("Não foi possível iniciar o microfone."); setListening(false); }
  }
  return <details onToggle={e=>{if(!e.currentTarget.open) recognition.current?.abort();}} className="rounded-lg border border-border px-3 py-2 text-xs">
    <summary className="flex cursor-pointer items-center gap-2"><Mic className="h-3.5 w-3.5" />Entrada por voz {listening ? "· ouvindo" : ""}</summary>
    <div className="mt-3 space-y-3 text-muted">
      <p>A fala vira texto para você revisar antes de enviar. O serviço de voz do navegador pode processar o áudio remotamente; o LegalOS não guarda a gravação. O mascaramento de CPF e e-mail acontece no texto enviado à IA, depois do reconhecimento.</p>
      {!supported ? <p>Reconhecimento de voz indisponível neste navegador. Continue pelo teclado.</p> : <><label className="flex items-start gap-2"><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); if (!e.target.checked) recognition.current?.abort(); }} />Quero usar o serviço de voz do navegador nesta conversa.</label><button type="button" disabled={disabled || !consent} onClick={() => listening ? recognition.current?.stop() : start()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-fg disabled:opacity-50">{listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}{listening ? "Parar de ouvir" : "Falar agora"}</button></>}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </details>;
}
export function SpeakAnswer({ text }: { text: string }) {
  const supported = React.useSyncExternalStore(subscribe, () => "speechSynthesis" in window, () => false);
  const [speaking, setSpeaking] = React.useState(false);
  React.useEffect(() => () => window.speechSynthesis?.cancel(), []);
  if (!supported) return null;
  function speak() {
    document.dispatchEvent(new Event("rute:voice-output"));
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, "link disponível na tela").slice(0, 6000));
    utterance.lang = "pt-BR";
    const local = window.speechSynthesis.getVoices().find(v => v.localService && v.lang.startsWith("pt"));
    if (local) utterance.voice = local;
    utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    setSpeaking(true); window.speechSynthesis.speak(utterance);
  }
  return <button type="button" title="Usa a leitura de texto do navegador; a disponibilidade e o processamento dependem do aparelho." onClick={speak} className="inline-flex items-center gap-1 rounded-md p-1 text-[11px] text-muted hover:bg-surface-2"><Volume2 className="h-3 w-3" />{speaking ? "Parar leitura" : "Ouvir resposta"}</button>;
}
