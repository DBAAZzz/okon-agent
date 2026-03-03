import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import type { Session } from "@/types/chat";

export function useSessions(
  botId: number | null,
  _currentSessionId: number | null,
  onNewSession: (sessionId: number) => void,
) {
  const [sessions, setSessions] = useState<Session[]>([]);

  const loadSessions = useCallback(async () => {
    if (!botId) {
      setSessions([]);
      return;
    }

    try {
      const list = await trpc.session.list.query({ botId });
      setSessions(list);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }, [botId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const createSession = async () => {
    if (!botId) return;
    try {
      const session = await trpc.session.create.mutate({ botId });
      setSessions((prev) => [session, ...prev]);
      onNewSession(session.id);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    try {
      await trpc.session.delete.mutate({ sessionId });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  return {
    sessions,
    createSession,
    deleteSession,
  };
}
