import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@okon/agent/src/trpc/router';

const agentApiBase = (process.env.NEXT_PUBLIC_AGENT_API_BASE ?? 'http://localhost:3001').replace(/\/$/, '');

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${agentApiBase}/trpc`,
    }),
  ],
});
