import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
describe("Voice permission policy",()=>{
 it("allows same-origin microphone only on authenticated application pages",()=>{
  for(const path of ["/rute","/area-de-trabalho/123","/clientes"]){
   const request=new NextRequest(`http://localhost${path}`);request.cookies.set(SESSION_COOKIE,"fixture");
   expect(proxy(request).headers.get("permissions-policy")).toBe("camera=(), microphone=(self), geolocation=()");
  }
 });
 it("does not widen microphone permissions on public pages or API endpoints",()=>{
  for(const path of ["/","/produto","/login","/api/mcp"]){
   const request=new NextRequest(`http://localhost${path}`);request.cookies.set(SESSION_COOKIE,"fixture");
   expect(proxy(request).headers.get("permissions-policy")).toBeNull();
  }
 });
});
