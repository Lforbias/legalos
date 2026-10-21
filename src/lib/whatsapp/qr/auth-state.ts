import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";
import type { AuthKv } from "./types";

type Lib = {
  BufferJSON: { replacer: (k: string, v: unknown) => unknown; reviver: (k: string, v: unknown) => unknown };
  initAuthCreds: () => AuthenticationCreds;
  proto: { Message: { AppStateSyncKeyData: { fromObject: (o: object) => unknown } } };
};

/** Estado de autenticação do Baileys guardado em `AuthKv` (equivalente ao `useMultiFileAuthState`, mas no banco e cifrado). */
export async function makeAuthState(kv: AuthKv, lib: Lib): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const ser = (v: unknown) => JSON.stringify(v, lib.BufferJSON.replacer);
  const de = <T>(s: string): T => JSON.parse(s, lib.BufferJSON.reviver) as T;
  const raw = await kv.get("creds");
  const creds = raw ? de<AuthenticationCreds>(raw) : lib.initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              const s = await kv.get(`${type}-${id}`);
              if (!s) return;
              let v = de<unknown>(s);
              if (type === "app-state-sync-key" && v) v = lib.proto.Message.AppStateSyncKeyData.fromObject(v as object);
              out[id] = v as SignalDataTypeMap[typeof type];
            }),
          );
          return out;
        },
        set: async (data) => {
          const entries: [string, string | null][] = [];
          for (const type of Object.keys(data)) {
            const byId = (data as Record<string, Record<string, unknown> | undefined>)[type] ?? {};
            for (const id of Object.keys(byId)) entries.push([`${type}-${id}`, byId[id] ? ser(byId[id]) : null]);
          }
          if (entries.length) await kv.set(entries);
        },
        clear: () => kv.clear(),
      },
    },
    saveCreds: () => kv.set([["creds", ser(creds)]]),
  };
}
