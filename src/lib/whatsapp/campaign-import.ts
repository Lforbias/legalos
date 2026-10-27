import { normalizeWaId } from "./phone";
/** Deliberately simple paste format: one `name;phone` per line, with optional header. */
export function parseCampaignContacts(text:string) {
 if(text.length>1_000_000)throw new Error("Lista muito grande (limite de 1 MB).");
 const rows=text.replace(/^\uFEFF/,"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(rows.length>10001)throw new Error("Limite de 10.000 contatos.");
 if(/^nome\s*[;\t]\s*telefone$/i.test(rows[0]??""))rows.shift();
 const seen=new Set<string>();
 return rows.flatMap((line,i)=>{
  const parts=line.split(/[;\t]/);const name=parts[0]?.trim(),phone=normalizeWaId(parts[1]?.trim()??"");
  if(parts.length!==2||!name||name.length>160||!phone)throw new Error(`Linha ${i+1}: informe nome e telefone válido com DDI, separados por ponto e vírgula.`);
  if(seen.has(phone))return [];seen.add(phone);return [{name,phone}];
 });
}
