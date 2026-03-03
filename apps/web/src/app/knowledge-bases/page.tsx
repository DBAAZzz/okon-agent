import { KnowledgeBasesPageClient } from "@/components/pages/KnowledgeBasesPageClient";
import { createServerTrpcClient } from "@/lib/server/trpc-client";

export default async function KnowledgeBasesPage() {
  const trpc = createServerTrpcClient();
  const knowledgeBases = await trpc.knowledgeBase.list.query();

  return <KnowledgeBasesPageClient initialKnowledgeBases={knowledgeBases} />;
}
