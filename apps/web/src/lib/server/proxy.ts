import "server-only";
import { getAgentBaseUrl } from "./env";

const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

function buildUpstreamUrl(request: Request, upstreamPath: string): URL {
  const incomingUrl = new URL(request.url);
  const target = new URL(upstreamPath, `${getAgentBaseUrl()}/`);
  target.search = incomingUrl.search;
  return target;
}

function forwardHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

export async function proxyToAgent(request: Request, upstreamPath: string): Promise<Response> {
  const targetUrl = buildUpstreamUrl(request, upstreamPath);
  const method = request.method.toUpperCase();

  const body = METHODS_WITHOUT_BODY.has(method) ? undefined : await request.arrayBuffer();

  const upstreamResponse = await fetch(targetUrl, {
    method,
    headers: forwardHeaders(request),
    body,
    redirect: "manual",
    cache: "no-store",
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: upstreamResponse.headers,
  });
}
