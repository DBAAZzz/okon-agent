import { proxyToAgent } from "@/lib/server/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return proxyToAgent(request, "/api/chat/continue");
}

export async function OPTIONS(request: Request): Promise<Response> {
  return proxyToAgent(request, "/api/chat/continue");
}
