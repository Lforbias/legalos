import { z } from "zod";
export const emailAccountSchema=z.object({
 address:z.email().max(254),
 imapHost:z.string().trim().min(3).max(200).regex(/^[a-zA-Z0-9.-]+$/),
 smtpHost:z.string().trim().min(3).max(200).regex(/^[a-zA-Z0-9.-]+$/),
 smtpPort:z.coerce.number().refine(v=>v===465||v===587,"Use a porta 465 ou 587."),
 username:z.string().trim().min(1).max(254),
 password:z.string().min(1).max(512),
 queueId:z.uuid().nullable().default(null),
});
export type EmailAccountConfig=z.infer<typeof emailAccountSchema>;
export type EmailEnvelope={uid:number;providerId:string;inReplyTo:string|null;references:string[];from:string;subject:string;text:string;at:Date;attachments:{filename:string;mime:string;content:Buffer}[]};
