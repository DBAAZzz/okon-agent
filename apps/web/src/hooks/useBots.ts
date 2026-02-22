import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import type { Bot } from "@/types/chat";

export function useBots() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);

  const loadBots = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const botList = await trpc.bot.list.query();
      setBots(botList as Bot[]);
    } catch (err) {
      setError(err);
      console.error("Failed to load bots:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  return { bots, error, isLoading };
}
