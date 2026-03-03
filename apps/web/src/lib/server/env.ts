import "server-only";

const DEFAULT_AGENT_BASE_URL = "http://localhost:" + "3001";
const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAgentBaseUrl(): string {
  const configured = process.env.AGENT_BASE_URL?.trim();
  if (!configured) return DEFAULT_AGENT_BASE_URL;
  return trimTrailingSlash(configured);
}

export function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (!configured) return DEFAULT_APP_BASE_URL;
  return trimTrailingSlash(configured);
}
