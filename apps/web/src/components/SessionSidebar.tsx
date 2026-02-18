'use client';

import Link from 'next/link';
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
    <aside className="w-72 max-w-[46vw] md:max-w-none h-full shrink-0 border-r border-[var(--line-soft)] bg-[linear-gradient(160deg,#1b2839_0%,#22364d_60%,#294666_100%)] text-[#f4f0e7] flex flex-col">
      <div className="m-4 mt-5 mb-0">
        <Link
          href="/channel"
          className="block w-full rounded-2xl border border-[#8ec7d266] bg-[#8ec7d218] px-4 py-3 text-center text-sm tracking-wide text-[#d8f1ff] hover:bg-[#8ec7d228] transition"
        >
          Channel 配置
        </Link>
      </div>

      {/* New session button */}
      <button
        onClick={handleNew}
        className="m-4 mt-5 rounded-2xl border border-[#f2c07866] bg-[#f2c07814] px-4 py-3 text-sm tracking-wide text-[#f7e5c2] hover:bg-[#f2c07824] transition"
      >
        + 新建会话
      </button>

      {/* Session list */}
      <div className="px-4 pb-2 text-[11px] uppercase tracking-[0.24em] text-[#cfdae8]">
        Sessions
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {sessions.map(session => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`group mb-1.5 flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer text-sm transition-all ${
              currentSessionId === session.id
                ? 'bg-[#f2c07826] text-[#fff2d5] shadow-[inset_0_0_0_1px_rgba(242,192,120,0.34)]'
                : 'text-[#d8e3ef] hover:bg-[#f2c07814] hover:text-[#fff2d5]'
            }`}
          >
            <span className="truncate pr-2">
              {session.title || session.id.slice(0, 8)}
            </span>
            <button
              onClick={(e) => handleDelete(e, session.id)}
              className="hidden group-hover:block text-[#f5d9c8] hover:text-[#ffb3a0] ml-2 shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
