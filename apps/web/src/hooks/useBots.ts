import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import type { Bot } from '@/types/chat';

type UseBotsOptions = {
  initialBots?: Bot[];
};

export function useBots(options: UseBotsOptions = {}) {
  const [bots, setBots] = useState<Bot[]>(options.initialBots ?? []);
  const [isLoading, setIsLoading] = useState(!(options.initialBots && options.initialBots.length > 0));
  const [error, setError] = useState<unknown | null>(null);

  const loadBots = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const botList = await trpc.bot.list.query();
      setBots(botList);
    } catch (err) {
      setError(err);
      console.error('Failed to load bots:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  return { bots, error, isLoading };
}
