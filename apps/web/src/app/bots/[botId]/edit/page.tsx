import { BotEditorWorkspace } from '@/components/BotEditorWorkspace';

type Props = {
  params: Promise<{
    botId: string;
  }>;
};

export default async function BotEditPage({ params }: Props) {
  const { botId } = await params;

  return <BotEditorWorkspace botId={Number(botId)} />;
}
