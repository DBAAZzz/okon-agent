'use client';

import { useState, useCallback } from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import { SessionSidebar } from '@/components/SessionSidebar';

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleSelectSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const handleNewSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  return (
    <main className="h-screen w-screen flex">
      <SessionSidebar
        currentSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
      />
      <div className="flex-1">
        {sessionId ? (
          <ChatInterface key={sessionId} sessionId={sessionId} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            新建或选择一个会话开始对话
          </div>
        )}
      </div>
    </main>
  );
}
