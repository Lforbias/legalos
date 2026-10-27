import { afterEach, describe, expect, it, vi } from "vitest";
import { createDictation, type Recognition } from "@/lib/ai/browser-voice";
class FakeRecognition implements Recognition {
 static last:FakeRecognition;
 lang="";continuous=true;interimResults=true;onresult:Recognition["onresult"]=null;onerror:Recognition["onerror"]=null;onend:Recognition["onend"]=null;
 start=vi.fn();stop=vi.fn();abort=vi.fn();constructor(){FakeRecognition.last=this;}
}
afterEach(()=>vi.useRealTimers());
describe("Voice dictation lifecycle",()=>{
 it("returns draft text only after recognition and never sends or writes anything",()=>{
  const onTranscript=vi.fn(),onError=vi.fn(),onEnd=vi.fn();const voice=createDictation(FakeRecognition,{onTranscript,onError,onEnd});voice.start();
  expect(FakeRecognition.last.lang).toBe("pt-BR");expect(FakeRecognition.last.continuous).toBe(false);
  FakeRecognition.last.onresult?.({results:[[{transcript:"Crie uma tarefa amanhã"}]]});
  expect(onTranscript).toHaveBeenCalledWith("Crie uma tarefa amanhã");voice.abort();
 });
 it("ignores late speech after closing the panel or changing context",()=>{
  const onTranscript=vi.fn();const voice=createDictation(FakeRecognition,{onTranscript,onError:vi.fn(),onEnd:vi.fn()});voice.start();voice.abort();
  FakeRecognition.last.onresult?.({results:[[{transcript:"Texto que chegou atrasado"}]]});expect(onTranscript).not.toHaveBeenCalled();
 });
 it("stops after one minute and clears timers on permission errors",()=>{
  vi.useFakeTimers();const onError=vi.fn();const voice=createDictation(FakeRecognition,{onTranscript:vi.fn(),onError,onEnd:vi.fn()});voice.start();vi.advanceTimersByTime(60_000);expect(FakeRecognition.last.stop).toHaveBeenCalledOnce();voice.abort();
  const second=createDictation(FakeRecognition,{onTranscript:vi.fn(),onError,onEnd:vi.fn()});second.start();FakeRecognition.last.onerror?.({error:"not-allowed"});vi.advanceTimersByTime(60_000);expect(onError).toHaveBeenCalledWith("not-allowed");expect(FakeRecognition.last.stop).not.toHaveBeenCalled();
 });
});
