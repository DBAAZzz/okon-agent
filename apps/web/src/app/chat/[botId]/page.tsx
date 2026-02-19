import { BotSessionWorkspace } from '@/components/BotSessionWorkspace';

type Props = {
  params: Promise<{
    botId: string;
  }>;
};

export default async function BotSessionPage({ params }: Props) {
  const { botId } = await params;

  return <BotSessionWorkspace botId={botId} />;
}
