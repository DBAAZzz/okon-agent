-- AlterTable: Message add compactedAt
ALTER TABLE "Message" ADD COLUMN "compactedAt" TIMESTAMP(3);

-- CreateTable: CompactionSummary
CREATE TABLE "CompactionSummary" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "messageIdFrom" INTEGER NOT NULL,
    "messageIdTo" INTEGER NOT NULL,
    "originalTokens" INTEGER NOT NULL,
    "summaryTokens" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompactionSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompactionSummary_sessionId_idx" ON "CompactionSummary"("sessionId");

-- AddForeignKey
ALTER TABLE "CompactionSummary" ADD CONSTRAINT "CompactionSummary_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
