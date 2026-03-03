import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@okon/agent/src/trpc/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
    }),
  ],
});
