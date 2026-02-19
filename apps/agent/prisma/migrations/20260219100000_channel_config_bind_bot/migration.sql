-- ChannelConfig: 去掉 platform unique，添加 botId（关联 Bot）
-- 先清理无 botId 的旧数据（含关联的 ChannelMapping）

DELETE FROM "ChannelMapping" WHERE "channelConfigId" IN (SELECT "id" FROM "ChannelConfig");
DELETE FROM "ChannelConfig";

-- 去掉 platform 的 unique 约束
ALTER TABLE "ChannelConfig" DROP CONSTRAINT IF EXISTS "ChannelConfig_platform_key";

-- 添加 botId 列
ALTER TABLE "ChannelConfig" ADD COLUMN "botId" TEXT NOT NULL;

-- 添加 botId 唯一约束
ALTER TABLE "ChannelConfig" ADD CONSTRAINT "ChannelConfig_botId_key" UNIQUE ("botId");

-- 添加外键约束
ALTER TABLE "ChannelConfig" ADD CONSTRAINT "ChannelConfig_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
