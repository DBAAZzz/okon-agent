import { proxyToAgent } from "@/lib/server/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyToAgent(request, `/api/knowledge-base/${path.join("/")}`);
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}
