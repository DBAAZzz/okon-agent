'use client';

import { useState, useCallback } from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import { SessionSidebar } from '@/components/SessionSidebar';
import { BotSidebar } from '@/components/BotSidebar';

export default function Home() {
  const [botId, setBotId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleSelectBot = useCallback((id: string) => {
    setBotId(id);
    setSessionId(null); // Reset session when bot changes
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const handleNewSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  return (
    <main className="h-screen w-screen p-2 md:p-4">
      <div className="h-full w-full overflow-hidden rounded-3xl border border-[var(--line-soft)] bg-[var(--surface-1)] shadow-[0_28px_80px_-40px_rgba(24,38,59,0.55)] backdrop-blur-sm flex">
        <BotSidebar
          currentBotId={botId}
          onSelectBot={handleSelectBot}
        />
        <SessionSidebar
          botId={botId}
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
        <div className="flex-1">
          {sessionId ? (
            <ChatInterface key={sessionId} sessionId={sessionId} />
          ) : (
            <div className="h-full flex items-center justify-center px-6">
              <div className="max-w-md text-center rise-in">
                <p className="text-3xl text-[var(--ink-1)]">Okon Agent</p>
                <p className="text-sm mt-3 text-[var(--ink-2)]">
                  {botId ? 'Select or create a session to start chatting.' : 'Select a bot to begin.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
