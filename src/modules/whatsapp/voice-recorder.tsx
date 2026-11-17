"use client";

import { Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const formats = [
  { mime: "audio/ogg;codecs=opus", extension: "ogg" },
  { mime: "audio/mp4;codecs=mp4a.40.2", extension: "m4a" },
  { mime: "audio/mp4", extension: "m4a" },
];

export function VoiceRecorder({ disabled, onSend, onError }: {
  disabled: boolean;
  onSend: (file: File) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<"idle" | "requesting" | "recording">("idle");
  const mounted = useRef(false);
  const stopRecording = useRef<((send: boolean) => void) | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopRecording.current?.(false);
    };
  }, []);

  async function begin() {
    const format = typeof MediaRecorder === "undefined"
      ? undefined
      : formats.find(({ mime }) => MediaRecorder.isTypeSupported(mime));
    if (!format || !navigator.mediaDevices?.getUserMedia) {
      onError("A gravação não está disponível neste navegador. Você pode anexar um áudio.");
      return;
    }

    setState("requesting");
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = stream.getTracks();
      if (!mounted.current) {
        tracks.forEach((track) => track.stop());
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType: format.mime, audioBitsPerSecond: 64_000 });
      const chunks: Blob[] = [];
      let send = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const timeout = window.setTimeout(() => stopRecording.current?.(false), 180_000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        tracks.forEach((track) => track.stop());
        stopRecording.current = null;
        if (mounted.current) setState("idle");
      };
      recorder.onstop = () => {
        cleanup();
        if (send && mounted.current && chunks.length) {
          onSend(new File(chunks, `mensagem-de-voz.${format.extension}`, { type: recorder.mimeType }));
        }
      };
      recorder.onerror = () => {
        send = false;
        cleanup();
        if (mounted.current) onError("Não foi possível gravar o áudio.");
      };
      recorder.start();
      stopRecording.current = (shouldSend) => {
        send = shouldSend;
        if (recorder.state !== "inactive") recorder.stop();
        tracks.forEach((track) => track.stop());
      };
      setState("recording");
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (mounted.current) {
        setState("idle");
        onError("Não foi possível iniciar a gravação. Confira o acesso ao microfone.");
      }
    }
  }

  const buttonClass = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-3 disabled:opacity-50";
  if (state === "recording") {
    return <div className="flex">
      <button type="button" className={buttonClass} aria-label="Cancelar gravação" title="Cancelar gravação" onClick={() => stopRecording.current?.(false)}><X className="h-5 w-5" aria-hidden /></button>
      <button type="button" className={buttonClass} aria-label="Parar e enviar áudio" title="Parar e enviar áudio" disabled={disabled} onClick={() => stopRecording.current?.(true)}><Square className="h-5 w-5 text-danger" aria-hidden /></button>
    </div>;
  }

  return <button type="button" className={buttonClass} aria-label="Gravar áudio" title="Gravar áudio" disabled={disabled || state === "requesting"} onClick={() => void begin()}><Mic className="h-5 w-5" aria-hidden /></button>;
}
