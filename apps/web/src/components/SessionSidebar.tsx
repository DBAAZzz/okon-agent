'use client';

import { useSessions } from '@/hooks/useSessions';

type Props = {
  botId: string | null;
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: (sessionId: string) => void;
};

export function SessionSidebar({ botId, currentSessionId, onSelectSession, onNewSession }: Props) {
  const { sessions, createSession, deleteSession } = useSessions(
    botId,
    currentSessionId,
    onNewSession
  );

  return (
    <aside className="w-72 max-w-[46vw] md:max-w-none h-full shrink-0 border-r border-[var(--line-soft)] bg-[#1e2c3d] text-[#f4f0e7] flex flex-col">
      {/* New session button */}
      <div className="p-3">
        <button
          onClick={createSession}
          disabled={!botId}
          className="w-full rounded-xl border border-[#f2c07866] bg-[#f2c07814] px-4 py-3 text-sm tracking-wide text-[#f7e5c2] hover:bg-[#f2c07824] transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          + New Session
        </button>
      </div>

      {/* Session list */}
      <div className="px-4 pb-2 text-[11px] uppercase tracking-[0.24em] text-[#cfdae8]">
        Sessions
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {!botId ? (
          <div className="p-4 text-center text-sm text-gray-400">
            Select a bot to see sessions.
          </div>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`group mb-1.5 flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer text-sm transition-all ${
                currentSessionId === session.id
                  ? 'bg-[#f2c07826] text-[#fff2d5] shadow-[inset_0_0_0_1px_rgba(242,192,120,0.34)]'
                  : 'text-[#d8e3ef] hover:bg-[#f2c07814] hover:text-[#fff2d5]'
              }`}
            >
              <div className="min-w-0">
                <div className="truncate pr-2">
                  {session.title || session.id.slice(0, 8)}
                </div>
              </div>
              <button
                onClick={(e) => deleteSession(e, session.id)}
                className="hidden group-hover:block text-[#f5d9c8] hover:text-[#ffb3a0] ml-2 shrink-0"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
