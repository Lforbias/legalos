import { NextResponse } from "next/server";
import { getTenant } from "@/server/session";
import { errorResponse } from "@/server/http";
import { emailAttachment } from "@/server/services/chat-email.service";
import { getObjectStream } from "@/lib/storage/local-storage";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{id:string;index:string}>}) {
 try{const tenant=await getTenant();if(!tenant)return new NextResponse(null,{status:401});const p=await params;const f=await emailAttachment(tenant.ctx,p.id,Number(p.index));return new NextResponse(await getObjectStream(f.key),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});}catch(e){return errorResponse(e);}
}
