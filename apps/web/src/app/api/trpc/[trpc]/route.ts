import { proxyToAgent } from "@/lib/server/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ trpc: string }>;
};

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { trpc } = await context.params;
  return proxyToAgent(request, `/trpc/${trpc}`);
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}
