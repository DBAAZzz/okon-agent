import { BotsPageClient } from "@/components/pages/BotsPageClient";
import { getBots } from "@/lib/server/bot-queries";

export default async function BotsPage() {
  const bots = await getBots();
  return <BotsPageClient initialBots={bots} />;
}
