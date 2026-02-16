'use client';

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';

type Session = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: (sessionId: string) => void;
};

export function SessionSidebar({ currentSessionId, onSelectSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);

  const loadSessions = useCallback(async () => {
    try {
      const list = await trpc.session.list.query();
      setSessions(list as Session[]);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleNew = async () => {
    try {
      const session = await trpc.session.create.mutate({});
      setSessions(prev => [session as Session, ...prev]);
      onNewSession(session.id);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await trpc.session.delete.mutate({ sessionId });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        // 删除当前会话后新建一个
        handleNew();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-full">
      {/* New session button */}
      <button
        onClick={handleNew}
        className="m-3 p-2 border border-gray-600 rounded-lg hover:bg-gray-700 transition text-sm"
      >
        + 新建会话
      </button>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.map(session => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`group flex items-center justify-between px-3 py-2 mx-2 rounded cursor-pointer text-sm truncate ${
              currentSessionId === session.id
                ? 'bg-gray-700'
                : 'hover:bg-gray-800'
            }`}
          >
            <span className="truncate">
              {session.title || session.id.slice(0, 8)}
            </span>
            <button
              onClick={(e) => handleDelete(e, session.id)}
              className="hidden group-hover:block text-gray-400 hover:text-red-400 ml-2 shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
