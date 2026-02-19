import { useState, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type { Session } from '@/types/chat';

export function useSessions(
  botId: number | null,
  currentSessionId: number | null,
  onNewSession: (sessionId: number) => void,
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
      setAllSessions(prev => [session as Session, ...prev]);
      onNewSession(session.id);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    try {
      await trpc.session.delete.mutate({ sessionId });
      setAllSessions(prev => prev.filter(s => s.id !== sessionId));
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
