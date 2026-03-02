'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import { SessionSidebar } from '@/components/SessionSidebar';
import { useBots } from '@/hooks/useBots';
import type { BotRecord } from '@/types/api';

type Props = {
  botId: number;
  initialBot: BotRecord;
};

export function BotSessionWorkspace({ botId, initialBot }: Props) {
  const { bots, isLoading } = useBots({ initialBots: [initialBot] });
  const [sessionId, setSessionId] = useState<number | null>(null);

  useEffect(() => {
    setSessionId(null);
  }, [botId]);

  const liveBot = useMemo(() => bots.find((item) => item.id === botId) ?? null, [bots, botId]);
  const bot = liveBot ?? initialBot;

  const handleSelectSession = useCallback((id: number) => {
    setSessionId(id);
  }, []);

  const handleNewSession = useCallback((id: number) => {
    setSessionId(id);
  }, []);

  if (!isLoading && !liveBot) {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-8 text-center shadow-[0_28px_80px_-40px_rgba(24,38,59,0.55)]">
          <h1 className="text-2xl text-[var(--ink-1)]">Bot 不存在或已删除</h1>
          <p className="mt-2 text-sm text-[var(--ink-2)]">请返回首页重新选择 Bot。</p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-xl bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-strong)] transition"
          >
            返回 Bot 列表
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen p-2 md:p-4">
      <div className="h-full w-full overflow-hidden rounded-3xl border border-[var(--line-soft)] bg-[var(--surface-1)] shadow-[0_28px_80px_-40px_rgba(24,38,59,0.55)] backdrop-blur-sm flex">
        <SessionSidebar
          botId={botId}
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
        <section className="flex-1 min-w-0 flex flex-col">
          <header className="shrink-0 border-b border-[var(--line-soft)] bg-white/62 px-4 py-3 backdrop-blur-sm md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-2)]">Current Bot</div>
                <div className="truncate text-sm font-semibold text-[var(--ink-1)]">
                  {bot ? `${bot.name} (${bot.model})` : 'Loading...'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/"
                  className="rounded-lg border border-[var(--line-soft)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:bg-white/70 transition"
                >
                  切换 Bot
                </Link>
                <Link
                  href={`/bots/${botId}/edit`}
                  className="rounded-lg border border-[var(--line-soft)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:bg-white/70 transition"
                >
                  编辑 Bot
                </Link>
                <Link
                  href="/bots"
                  className="rounded-lg border border-[var(--line-soft)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:bg-white/70 transition"
                >
                  管理 Bot
                </Link>
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0">
            {sessionId ? (
              <ChatInterface key={sessionId} sessionId={sessionId} />
            ) : (
              <div className="h-full flex items-center justify-center px-6">
                <div className="max-w-md text-center rise-in">
                  <p className="text-3xl text-[var(--ink-1)]">Session Workspace</p>
                  <p className="mt-3 text-sm text-[var(--ink-2)]">请从左侧选择会话，或新建会话开始聊天。</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
