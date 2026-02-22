-- Update existing rows to satisfy NOT NULL constraint
UPDATE "Bot"
SET "apiKey" = ''
WHERE "apiKey" IS NULL;

-- AlterTable
ALTER TABLE "Bot"
ALTER COLUMN "apiKey" SET NOT NULL;
