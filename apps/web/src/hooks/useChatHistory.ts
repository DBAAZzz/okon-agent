import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import type { UIMessage } from "ai";
import { toHistoryUIMessages } from "@/lib/chat-transformers";

export function useChatHistory(
  sessionId: string,
  setMessages: (messages: UIMessage[]) => void,
) {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setIsLoading(true);
      try {
        const { history } = await trpc.chat.getHistory.query({ sessionId });
        if (cancelled) return;
        setMessages(toHistoryUIMessages(history as any[]));
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [sessionId, setMessages]);

  return { isLoading };
}
