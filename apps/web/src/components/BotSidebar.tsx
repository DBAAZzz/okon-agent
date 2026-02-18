'use client';

import Link from 'next/link';
import { useBots } from '@/hooks/useBots';
import { Bot } from '@/types/chat';

type Props = {
  currentBotId: string | null;
  onSelectBot: (botId: string) => void;
};

export function BotSidebar({ currentBotId, onSelectBot }: Props) {
  const { bots, isLoading } = useBots();

  return (
    <aside className="w-64 max-w-[30vw] md:max-w-none h-full shrink-0 border-r border-[var(--line-soft)] bg-[linear-gradient(160deg,#1b2839_0%,#22364d_60%,#294666_100%)] text-[#f4f0e7] flex flex-col">
      <div className="p-4 text-center text-lg font-medium border-b border-[var(--line-soft)]">
        Bots
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && <div className="p-2 text-center text-sm text-gray-400">Loading bots...</div>}
        {bots.map((bot: Bot) => (
          <div
            key={bot.id}
            onClick={() => onSelectBot(bot.id)}
            className={`group mb-1.5 flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer text-sm transition-all ${
              currentBotId === bot.id
                ? 'bg-[#f2c07826] text-[#fff2d5] shadow-[inset_0_0_0_1px_rgba(242,192,120,0.34)]'
                : 'text-[#d8e3ef] hover:bg-[#f2c07814] hover:text-[#fff2d5]'
            }`}
          >
            <div className="min-w-0">
              <div className="truncate pr-2 font-medium">{bot.name}</div>
              <div className="text-xs text-[#99b3c9] truncate">{bot.model}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-[var(--line-soft)]">
        <Link
          href="/bots"
          className="block w-full rounded-lg border border-[#8ec7d266] bg-[#8ec7d218] px-4 py-2 text-center text-sm tracking-wide text-[#d8f1ff] hover:bg-[#8ec7d228] transition"
        >
          + New Bot
        </Link>
      </div>
    </aside>
  );
}
