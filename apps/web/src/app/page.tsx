import { HomePageClient } from '@/components/pages/HomePageClient';
import { getBots } from '@/lib/server/bot-queries';

export default async function Home() {
  const bots = await getBots();
  return <HomePageClient initialBots={bots} />;
}
