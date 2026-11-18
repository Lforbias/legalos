"use client";

import { Mic, MicOff, MonitorUp, PhoneOff, UserMinus, Video, VideoOff } from "lucide-react";
import * as React from "react";
import type { LocalParticipant, Participant, RemoteParticipant, Room, Track as LkTrack } from "livekit-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { joinVideoAction, removeFromVideoAction } from "./actions";
import { PersonAvatar } from "./ui";

type Lk = typeof import("livekit-client");
type Phase = "idle" | "connecting" | "connected" | "reconnecting" | "ended" | "error";

/** Anexa uma faixa de mídia do LiveKit a um elemento <video>/<audio> e solta ao desmontar. */
function TrackView({ track, kind, muted, className }: { track: LkTrack; kind: "video" | "audio"; muted?: boolean; className?: string }) {
  const ref = React.useRef<HTMLVideoElement & HTMLAudioElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return kind === "video" ? <video ref={ref} autoPlay playsInline muted={muted} className={className} /> : <audio ref={ref} autoPlay />;
}

function Tile({ lk, p, local, isHost, onRemove }: { lk: Lk; p: Participant; local: boolean; isHost: boolean; onRemove?: () => void }) {
  const cam = p.getTrackPublication(lk.Track.Source.Camera);
  const mic = p.getTrackPublication(lk.Track.Source.Microphone);
  const camTrack = cam && !cam.isMuted ? cam.track : undefined;
  const name = p.name || "Participante";
  return (
    <div className={cn("relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border bg-surface-2", p.isSpeaking ? "border-success" : "border-border")} data-testid="video-tile" data-identity={p.identity} data-local={local ? "1" : "0"}>
      {camTrack ? <TrackView track={camTrack} kind="video" muted={local} className="h-full w-full object-cover" /> : <PersonAvatar id={p.identity} name={name} size={56} />}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
        {mic && !mic.isMuted ? <Mic className="h-3 w-3" aria-hidden /> : <MicOff className="h-3 w-3" aria-label="Microfone desligado" />}
        <span>{name}{local ? " (você)" : ""}</span>
      </div>
      {isHost && !local && onRemove ? (
        <button type="button" onClick={onRemove} className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white hover:bg-danger" aria-label={`Remover ${name} da chamada`} title="Remover da chamada">
          <UserMinus className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Chamada da reunião (LiveKit). Só aparece quando a videoconferência está habilitada no servidor e a reunião está
 * em andamento; o token é emitido pelo LegalOS apenas para participantes convidados.
 */
export function VideoRoom({ meetingId }: { meetingId: string }) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [mic, setMic] = React.useState(true);
  const [cam, setCam] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [isHost, setIsHost] = React.useState(false);
  const [, setTick] = React.useState(0);
  const [conn, setConn] = React.useState<{ room: Room; lk: Lk } | null>(null);
  const roomRef = React.useRef<Room | null>(null);
  const lkRef = React.useRef<Lk | null>(null);
  const leaving = React.useRef(false);
  const rerender = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => () => void roomRef.current?.disconnect(), []);


  const join = async (opts?: { mic: boolean; cam: boolean }) => {
    const wantMic = opts?.mic ?? mic;
    const wantCam = opts?.cam ?? cam;
    // Documento aberto por navegação interna a partir de uma página sem permissão de câmera: recarrega esta página
    // (com os cabeçalhos certos) e entra automaticamente na chamada.
    const policy = (document as unknown as { permissionsPolicy?: { allowsFeature(f: string): boolean }; featurePolicy?: { allowsFeature(f: string): boolean } });
    const allows = policy.permissionsPolicy ?? policy.featurePolicy;
    if (allows && (!allows.allowsFeature("camera") || !allows.allowsFeature("microphone"))) {
      try {
        sessionStorage.setItem(`cowork-autojoin:${meetingId}`, JSON.stringify({ mic: wantMic, cam: wantCam }));
      } catch {
        /* sem armazenamento: a pessoa clica de novo */
      }
      window.location.reload();
      return;
    }
    setError(null);
    setPhase("connecting");
    leaving.current = false;
    const r = await joinVideoAction(meetingId);
    if (!r.ok || !r.data) {
      setPhase("error");
      setError(r.message ?? "Não foi possível entrar na chamada.");
      return;
    }
    try {
      const lk = lkRef.current ?? (await import("livekit-client"));
      lkRef.current = lk;
      const room = new lk.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      const E = lk.RoomEvent;
      for (const ev of [E.ParticipantConnected, E.ParticipantDisconnected, E.TrackSubscribed, E.TrackUnsubscribed, E.TrackMuted, E.TrackUnmuted, E.LocalTrackPublished, E.LocalTrackUnpublished, E.ActiveSpeakersChanged]) room.on(ev, rerender);
      room.on(E.Reconnecting, () => setPhase("reconnecting"));
      room.on(E.Reconnected, () => setPhase("connected"));
      room.on(E.Disconnected, (reason) => {
        roomRef.current = null;
        setConn(null);
        setSharing(false);
        if (leaving.current) return setPhase("idle");
        setPhase("ended");
        setError(reason === 4 ? "O anfitrião removeu você da chamada." : reason === 5 ? "A reunião foi encerrada." : "A conexão com a chamada caiu. Tente entrar de novo.");
      });
      setIsHost(r.data.isHost);
      await room.connect(r.data.url, r.data.token);
      setConn({ room, lk });
      setPhase("connected");
      await room.localParticipant.setMicrophoneEnabled(wantMic).catch(() => {
        setMic(false);
        setError("Não foi possível usar o microfone. Verifique a permissão do navegador.");
      });
      if (wantCam) await room.localParticipant.setCameraEnabled(true).catch(() => {
        setCam(false);
        setError("Não foi possível usar a câmera. Verifique a permissão do navegador.");
      });
      rerender();
    } catch (e) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setConn(null);
      setPhase("error");
      setError(`Não foi possível conectar ao servidor de vídeo. ${(e as Error).message ?? ""}`.trim());
    }
  };

  // Retoma a entrada pedida antes do recarregamento da página (ver `join`).
  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    let pending: { mic: boolean; cam: boolean } | null = null;
    try {
      const raw = sessionStorage.getItem(`cowork-autojoin:${meetingId}`);
      sessionStorage.removeItem(`cowork-autojoin:${meetingId}`);
      pending = raw ? (JSON.parse(raw) as { mic: boolean; cam: boolean }) : null;
    } catch {
      pending = null;
    }
    if (!pending) return;
    const p = pending;
    queueMicrotask(() => {
      setMic(p.mic);
      setCam(p.cam);
      void join(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const toggle = async (kind: "mic" | "cam" | "screen") => {
    const lp: LocalParticipant | undefined = roomRef.current?.localParticipant;
    if (!lp) {
      if (kind === "mic") setMic((v) => !v);
      if (kind === "cam") setCam((v) => !v);
      return;
    }
    try {
      if (kind === "mic") { await lp.setMicrophoneEnabled(!mic); setMic(!mic); }
      if (kind === "cam") { await lp.setCameraEnabled(!cam); setCam(!cam); }
      if (kind === "screen") { await lp.setScreenShareEnabled(!sharing); setSharing(!sharing); }
      setError(null);
    } catch {
      setError(kind === "screen" ? "O compartilhamento de tela foi cancelado ou não é permitido." : "O navegador não liberou o dispositivo. Verifique as permissões.");
    }
    rerender();
  };

  const leave = async () => {
    leaving.current = true;
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setConn(null);
    setPhase("idle");
  };

  const room = conn?.room ?? null;
  const lk = conn?.lk ?? null;
  const remotes: RemoteParticipant[] = room ? [...room.remoteParticipants.values()] : [];
  const screens = room && lk ? [room.localParticipant, ...remotes].flatMap((p) => { const pub = p.getTrackPublication(lk.Track.Source.ScreenShare); return pub?.track ? [{ p, track: pub.track }] : []; }) : [];

  return (
    <section className="rounded-xl border border-border bg-surface p-4" aria-label="Chamada de vídeo" data-testid="video-room" data-phase={phase}>
      {phase === "connected" || phase === "reconnecting" ? (
        <>
          {phase === "reconnecting" ? <p className="mb-2 rounded-md bg-warning-bg px-3 py-1.5 text-xs text-warning" role="status">Conexão instável: reconectando à chamada…</p> : null}
          {screens.map((s) => (
            <div key={`screen-${s.p.identity}`} className="mb-3 overflow-hidden rounded-xl border border-border bg-black" data-testid="video-screen">
              <TrackView track={s.track} kind="video" muted className="max-h-[60vh] w-full object-contain" />
              <p className="px-3 py-1.5 text-xs text-muted">Tela de {s.p.name || "participante"}</p>
            </div>
          ))}
          {room && lk ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Tile lk={lk} p={room.localParticipant} local isHost={isHost} />
              {remotes.map((p) => (
                <Tile key={p.identity} lk={lk} p={p} local={false} isHost={isHost} onRemove={async () => { const r = await removeFromVideoAction(meetingId, p.identity); if (!r.ok) setError(r.message ?? "Falha ao remover."); }} />
              ))}
            </div>
          ) : null}
          {remotes.flatMap((p) => { const pub = lk ? p.getTrackPublication(lk.Track.Source.Microphone) : undefined; return pub?.track ? [<TrackView key={`a-${p.identity}`} track={pub.track} kind="audio" />] : []; })}
          <p className="mt-2 text-xs text-muted" data-testid="video-count">{remotes.length + 1} na chamada</p>
        </>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <h3 className="text-sm font-semibold">Chamada de vídeo</h3>
          <p className="text-xs text-muted">{phase === "ended" ? "Você saiu da chamada." : "Escolha como entrar. O navegador pedirá permissão para microfone e câmera."}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={mic ? "secondary" : "danger"} onClick={() => void toggle("mic")} aria-pressed={mic} data-testid="video-mic">{mic ? <Mic className="h-4 w-4" aria-hidden /> : <MicOff className="h-4 w-4" aria-hidden />}{mic ? "Microfone ligado" : "Microfone desligado"}</Button>
        <Button size="sm" variant={cam ? "secondary" : "ghost"} onClick={() => void toggle("cam")} aria-pressed={cam} data-testid="video-cam">{cam ? <Video className="h-4 w-4" aria-hidden /> : <VideoOff className="h-4 w-4" aria-hidden />}{cam ? "Câmera ligada" : "Câmera desligada"}</Button>
        {phase === "connected" ? <Button size="sm" variant={sharing ? "primary" : "secondary"} onClick={() => void toggle("screen")} aria-pressed={sharing} data-testid="video-screen-share"><MonitorUp className="h-4 w-4" aria-hidden />{sharing ? "Parar de compartilhar" : "Compartilhar tela"}</Button> : null}
        {phase === "connected" || phase === "reconnecting" ? (
          <Button size="sm" variant="danger" onClick={() => void leave()} data-testid="video-leave"><PhoneOff className="h-4 w-4" aria-hidden /> Sair da chamada</Button>
        ) : (
          <Button size="sm" onClick={() => void join()} loading={phase === "connecting"} data-testid="video-join"><Video className="h-4 w-4" aria-hidden /> {phase === "ended" || phase === "error" ? "Entrar de novo" : "Entrar na chamada"}</Button>
        )}
      </div>
      {error ? <p className="mt-2 text-xs text-danger" role="alert">{error}</p> : null}
    </section>
  );
}
