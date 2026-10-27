/** Browser-owned speech recognition. It only returns draft text, never sends a chat message. */
export type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null; onerror: ((e: {error: string}) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void };
export type Dictation = { start():void; stop():void; abort():void };
export function createDictation(Constructor: new()=>Recognition, callbacks: {onTranscript:(text:string)=>void;onError:(error:string)=>void;onEnd:()=>void}): Dictation {
 const recognition=new Constructor();let active=false,timer:ReturnType<typeof setTimeout>|undefined;
 const clear=()=>{if(timer)clearTimeout(timer);timer=undefined;};
 recognition.lang="pt-BR";recognition.continuous=false;recognition.interimResults=false;
 recognition.onresult=e=>{if(!active)return;const text=Array.from(e.results).map(result=>result[0]?.transcript??"").join(" ").trim();if(text)callbacks.onTranscript(text);};
 recognition.onerror=e=>{if(!active)return;active=false;clear();callbacks.onError(e.error);};
 recognition.onend=()=>{active=false;clear();callbacks.onEnd();};
 return {
  start(){active=true;try{recognition.start();timer=setTimeout(()=>{if(active)recognition.stop();},60_000);}catch(error){active=false;clear();throw error;}},
  stop(){if(active)recognition.stop();},
  abort(){active=false;clear();recognition.onresult=null;recognition.onerror=null;recognition.onend=null;recognition.abort();callbacks.onEnd();}
 };
}
