import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BotSessionWorkspace } from '@/components/BotSessionWorkspace';
import { getBotById } from '@/lib/server/bot-queries';

type Props = {
  params: Promise<{
    botId: string;
  }>;
};

function parseBotId(value: string): number | null {
  const botId = Number(value);
  return Number.isInteger(botId) && botId > 0 ? botId : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { botId: botIdParam } = await params;
  const botId = parseBotId(botIdParam);

  if (!botId) {
    return {
      title: 'Bot Not Found',
      alternates: { canonical: '/chat' },
    };
  }

  const bot = await getBotById(botId);
  if (!bot) {
    return {
      title: 'Bot Not Found',
      alternates: { canonical: '/chat' },
    };
  }

  return {
    title: `${bot.name} Chat`,
    alternates: { canonical: `/chat/${botId}` },
  };
}

export default async function BotSessionPage({ params }: Props) {
  const { botId: botIdParam } = await params;
  const botId = parseBotId(botIdParam);

  if (!botId) {
    notFound();
  }

  const bot = await getBotById(botId);
  if (!bot) {
    notFound();
  }

  return <BotSessionWorkspace botId={botId} initialBot={bot} />;
}
