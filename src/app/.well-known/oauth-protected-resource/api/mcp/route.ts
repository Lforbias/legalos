import { NextResponse } from "next/server";
import { META_HEADERS, protectedResourceMetadata } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const GET = () => NextResponse.json(protectedResourceMetadata(), { headers: META_HEADERS });
