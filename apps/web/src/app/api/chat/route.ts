import { proxyToAgent } from '@/lib/server/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return proxyToAgent(request, '/api/chat');
}

export async function OPTIONS(request: Request): Promise<Response> {
  return proxyToAgent(request, '/api/chat');
}
