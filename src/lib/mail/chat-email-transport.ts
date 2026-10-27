import dns from "node:dns/promises";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { isPrivateAddress } from "@/lib/mni/transport";
import type { EmailAccountConfig,EmailEnvelope } from "@/lib/whatsapp/email-schema";

export interface ChatEmailDriver {
 verify(config:EmailAccountConfig):Promise<void>;
 receive(config:EmailAccountConfig,cursor:{validity:string|null;uid:number}):Promise<{validity:string;messages:EmailEnvelope[];lastUid:number;skipped:number}>;
 send(config:EmailAccountConfig,input:{to:string;subject:string;text:string;messageId:string;inReplyTo?:string;references?:string[]}):Promise<void>;
}
async function destination(host:string) {
 const addresses=await dns.lookup(host,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(a=>isPrivateAddress(a.address)))throw new Error("O servidor de e-mail precisa ter endereço público.");
 return addresses[0]!.address;
}
async function imap(config:EmailAccountConfig) {
 const host=await destination(config.imapHost);
 const client=new ImapFlow({host,port:993,secure:true,tls:{servername:config.imapHost,rejectUnauthorized:true},auth:{user:config.username,pass:config.password},logger:false,disableAutoIdle:true,connectionTimeout:15000,socketTimeout:20000});
 // ImapFlow emits errors in addition to rejecting operations. No credentials/content are logged.
 client.on("error",()=>{});
 return client;
}
async function smtp(config:EmailAccountConfig) {
 const host=await destination(config.smtpHost);
 return nodemailer.createTransport({host,port:config.smtpPort,secure:config.smtpPort===465,requireTLS:true,tls:{servername:config.smtpHost,rejectUnauthorized:true},auth:{user:config.username,pass:config.password},connectionTimeout:15000,socketTimeout:20000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
}
const production:ChatEmailDriver={
 async verify(config) {
  const client=await imap(config);try{await client.connect();await client.mailboxOpen("INBOX",{readOnly:true});}finally{client.close();}
  const transport=await smtp(config);try{await transport.verify();}finally{transport.close();}
 },
 async receive(config,cursor) {
  const client=await imap(config);const messages:EmailEnvelope[]=[];let skipped=0;
  try {
   await client.connect();const box=await client.mailboxOpen("INBOX",{readOnly:true});const validity=String(box.uidValidity);
   const same=cursor.validity===validity;
   // Initial setup imports at most the latest 50 messages, never the entire mailbox.
   const uidEnd=Math.min(Number(box.uidNext)-1,cursor.uid+1000);
   const metadata=box.exists&&(!same||cursor.uid<uidEnd)?await client.fetchAll(same?`${cursor.uid+1}:${uidEnd}`:`${Math.max(1,box.exists-49)}:*`,{uid:true,size:true},same?{uid:true}:{}):[];
   const fresh=metadata.filter(m=>!same||m.uid>cursor.uid).sort((a,b)=>a.uid-b.uid).slice(0,50);
   let lastUid=same?(!fresh.length?uidEnd:cursor.uid):0;
   const deadline=Date.now()+45000;
   for(const meta of fresh) {
    if(messages.length>=20||Date.now()>deadline)break;
    // Bound memory before downloading and parsing MIME, including attachments.
    if((meta.size??Infinity)>2*1024*1024){skipped++;lastUid=meta.uid;continue;}
    const fetched=await client.fetchOne(String(meta.uid),{source:true,uid:true},{uid:true});
    if(!fetched||!fetched.source)throw new Error("Mensagem não disponível no IMAP.");
    if(fetched.source.length>2*1024*1024){skipped++;lastUid=meta.uid;continue;}
    const parsed=await simpleParser(fetched.source,{skipHtmlToText:false,skipImageLinks:true,skipTextToHtml:true});
    const from=parsed.from?.value[0]?.address?.toLowerCase()??"";
    const refs=Array.isArray(parsed.references)?parsed.references:parsed.references?[parsed.references]:[];
    const at=parsed.date&&Number.isFinite(parsed.date.getTime())?parsed.date:new Date();
    messages.push({uid:meta.uid,providerId:parsed.messageId?.slice(0,998)||`imap:${validity}:${meta.uid}`,inReplyTo:parsed.inReplyTo?.slice(0,998)??null,references:refs.slice(-20),from,subject:(parsed.subject??"Sem assunto").replace(/[\r\n]/g," ").slice(0,200),text:(parsed.text??"[Mensagem sem versão de texto]").slice(0,50000),at,attachments:parsed.attachments.slice(0,10).map(a=>({filename:(a.filename??"anexo").slice(0,160),mime:a.contentType,content:a.content}))});
    lastUid=meta.uid;
   }
   return {validity,messages,lastUid,skipped};
  }finally{client.close();}
 },
 async send(config,input) {
  const transport=await smtp(config);
  try{const r=await transport.sendMail({from:{address:config.address,name:""},to:input.to,subject:input.subject,text:input.text,messageId:input.messageId,inReplyTo:input.inReplyTo,references:input.references,disableFileAccess:true,disableUrlAccess:true});if(!r.accepted.length)throw new Error("SMTP não aceitou o destinatário.");}finally{transport.close();}
 }
};
let override:ChatEmailDriver|undefined;
export function __setChatEmailDriverForTests(driver:ChatEmailDriver|undefined){override=driver;}
export function chatEmailDriver(){return override??production;}
