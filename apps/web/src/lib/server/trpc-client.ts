import 'server-only';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@okon/agent/src/trpc/router';
import { getAgentBaseUrl } from './env';

export function createServerTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getAgentBaseUrl()}/trpc`,
      }),
    ],
  });
}
