-- DropForeignKey
ALTER TABLE "BotKnowledgeBase" DROP CONSTRAINT "BotKnowledgeBase_botId_fkey";

-- DropForeignKey
ALTER TABLE "BotKnowledgeBase" DROP CONSTRAINT "BotKnowledgeBase_knowledgeBaseId_fkey";

-- DropForeignKey
ALTER TABLE "ChannelConfig" DROP CONSTRAINT "ChannelConfig_botId_fkey";

-- DropForeignKey
ALTER TABLE "ChannelMapping" DROP CONSTRAINT "ChannelMapping_channelConfigId_fkey";

-- DropForeignKey
ALTER TABLE "ChannelMapping" DROP CONSTRAINT "ChannelMapping_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_knowledgeBaseId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_botId_fkey";

-- AlterTable
ALTER TABLE "Bot" DROP CONSTRAINT "Bot_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Bot_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "BotKnowledgeBase" DROP CONSTRAINT "BotKnowledgeBase_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "botId",
ADD COLUMN     "botId" INTEGER NOT NULL,
DROP COLUMN "knowledgeBaseId",
ADD COLUMN     "knowledgeBaseId" INTEGER NOT NULL,
ADD CONSTRAINT "BotKnowledgeBase_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ChannelConfig" DROP CONSTRAINT "ChannelConfig_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "botId",
ADD COLUMN     "botId" INTEGER NOT NULL,
ADD CONSTRAINT "ChannelConfig_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ChannelMapping" DROP CONSTRAINT "ChannelMapping_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "channelConfigId",
ADD COLUMN     "channelConfigId" INTEGER NOT NULL,
DROP COLUMN "sessionId",
ADD COLUMN     "sessionId" INTEGER NOT NULL,
ADD CONSTRAINT "ChannelMapping_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Document" DROP CONSTRAINT "Document_pkey",
ADD COLUMN     "chunkIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceFileId" INTEGER NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "knowledgeBaseId",
ADD COLUMN     "knowledgeBaseId" INTEGER NOT NULL,
ADD CONSTRAINT "Document_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "KnowledgeBase" DROP CONSTRAINT "KnowledgeBase_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Message" DROP CONSTRAINT "Message_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "sessionId",
ADD COLUMN     "sessionId" INTEGER NOT NULL,
ADD CONSTRAINT "Message_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Session" DROP CONSTRAINT "Session_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "botId",
ADD COLUMN     "botId" INTEGER,
ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "SourceFile" (
    "id" SERIAL NOT NULL,
    "knowledgeBaseId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceFile_knowledgeBaseId_idx" ON "SourceFile"("knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFile_knowledgeBaseId_checksum_key" ON "SourceFile"("knowledgeBaseId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "BotKnowledgeBase_botId_knowledgeBaseId_key" ON "BotKnowledgeBase"("botId", "knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConfig_botId_key" ON "ChannelConfig"("botId");

-- CreateIndex
CREATE INDEX "ChannelMapping_sessionId_idx" ON "ChannelMapping"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMapping_channelConfigId_externalChatId_key" ON "ChannelMapping"("channelConfigId", "externalChatId");

-- CreateIndex
CREATE INDEX "Document_knowledgeBaseId_idx" ON "Document"("knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_sourceFileId_chunkIndex_key" ON "Document"("sourceFileId", "chunkIndex");

-- CreateIndex
CREATE INDEX "Message_sessionId_idx" ON "Message"("sessionId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConfig" ADD CONSTRAINT "ChannelConfig_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMapping" ADD CONSTRAINT "ChannelMapping_channelConfigId_fkey" FOREIGN KEY ("channelConfigId") REFERENCES "ChannelConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMapping" ADD CONSTRAINT "ChannelMapping_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceFile" ADD CONSTRAINT "SourceFile_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SourceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotKnowledgeBase" ADD CONSTRAINT "BotKnowledgeBase_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotKnowledgeBase" ADD CONSTRAINT "BotKnowledgeBase_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

