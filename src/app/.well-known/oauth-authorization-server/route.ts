import { NextResponse } from "next/server";
import { authServerMetadata, META_HEADERS } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const GET = () => NextResponse.json(authServerMetadata(), { headers: META_HEADERS });
