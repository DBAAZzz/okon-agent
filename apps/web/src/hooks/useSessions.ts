import { useState, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type { Session } from '@/types/chat';

export function useSessions(
  botId: string | null,
  currentSessionId: string | null,
  onNewSession: (sessionId: string) => void,
) {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  
  const loadSessions = useCallback(async () => {
    try {
      const list = await trpc.session.list.query();
      setAllSessions(list as Session[]);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const sessions = useMemo(() => {
    if (!botId) return [];
    return allSessions.filter(s => s.bot?.id === botId);
  }, [allSessions, botId]);

  const createSession = async () => {
    if (!botId) return;
    try {
      const session = await trpc.session.create.mutate({ botId });
      // Prepend the new session and trigger a refresh
      setAllSessions(prev => [session as Session, ...prev]);
      onNewSession(session.id);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await trpc.session.delete.mutate({ sessionId });
      setAllSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId && botId) {
        // If the active session is deleted, do not automatically create a new one.
        // Let the user decide.
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  return {
    sessions,
    createSession,
    deleteSession,
  };
}
