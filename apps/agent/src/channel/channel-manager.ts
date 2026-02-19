import type { ModelMessage } from 'ai'
import { createLogger } from '@okon/shared'
import { runAgent, finalizeStream } from '../agent/gateway.js'
import { adaptStream } from '../agent/events/index.js'
import { sessionManager } from '../agent/session-manager.js'
import { knowledgeStore } from '../capabilities/knowledge/index.js'
import type { ChannelAdapter, InboundMessage, OutboundReplyStream } from './types.js'
import { createFeishuAdapter, type FeishuConfig } from './feishu-adapter.js'
import type { AppPrismaClient } from '../plugins/prisma-types.js'

const logger = createLogger('channel-manager')

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return error
}

function extractAssistantText(messages: ModelMessage[]): string {
  const textParts: string[] = []

  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (part.type === 'text' && part.text) {
        textParts.push(part.text)
      }
    }
  }

  return textParts.join('\n') || '（无响应）'
}

export interface ChannelManager {
  startAll(): Promise<void>
  startOne(configId: number, platform: string, config: Record<string, any>, botId: number): Promise<void>
  stopOne(configId: number): Promise<void>
  stopAll(): Promise<void>
}

export function createChannelManager(prisma: AppPrismaClient): ChannelManager {
  const adapters = new Map<number, { adapter: ChannelAdapter; platform: string }>()

  async function startAll(): Promise<void> {
    const configs = await prisma.channelConfig.findMany({
      where: { enabled: true },
    })

    for (const cfg of configs) {
      try {
        await startOne(cfg.id, cfg.platform, cfg.config as Record<string, any>, cfg.botId)
      } catch (err) {
        logger.error('启动 channel 失败', { platform: cfg.platform, error: err })
      }
    }

    logger.info('channel 初始化完成', { count: adapters.size })
  }

  async function startOne(
    configId: number,
    platform: string,
    config: Record<string, any>,
    botId: number,
  ): Promise<void> {
    if (adapters.has(configId)) {
      logger.warn('channel 已在运行', { configId })
      return
    }

    const adapter = createAdapter(platform, config)
    if (!adapter) {
      logger.warn('不支持的 platform', { platform })
      return
    }

    await adapter.start((msg) => handleMessage(configId, platform, adapter, msg, botId))
    adapters.set(configId, { adapter, platform })
    logger.info('channel 已启动', { configId, platform, botId })
  }

  async function stopOne(configId: number): Promise<void> {
    const entry = adapters.get(configId)
    if (!entry) return

    await entry.adapter.stop()
    adapters.delete(configId)
    logger.info('channel 已停止', { configId })
  }

  async function stopAll(): Promise<void> {
    for (const [id, { adapter }] of adapters) {
      await adapter.stop().catch((err) => logger.error('停止 channel 失败', { id, error: err }))
    }
    adapters.clear()
  }

  async function handleMessage(
    configId: number,
    platform: string,
    adapter: ChannelAdapter,
    msg: InboundMessage,
    botId: number,
  ): Promise<void> {
    let replyStream: OutboundReplyStream | undefined

    try {
      const sessionId: number = await resolveSession(configId, platform, msg.externalChatId, botId)

      logger.info('处理 channel 消息', { configId, sessionId, chatId: msg.externalChatId })
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { bot: { select: { id: true, provider: true, model: true, systemPrompt: true, apiKey: true, baseURL: true } } },
      })
      if (!session?.bot) {
        throw new Error(`Session ${sessionId} has no bot configured`)
      }
      const agentStream = await runAgent(sessionId, msg.text, { historyLimit: 0, bot: session.bot, knowledgeStore })
      replyStream = await adapter.createReplyStream?.(msg.externalChatId)

      if (replyStream) {
        let streamedText = ''
        let streamErrorMessage: string | null = null

        for await (const event of adaptStream(agentStream.result.fullStream)) {
          if (event.type === 'text_delta' && event.delta) {
            streamedText += event.delta
            await replyStream.append(event.delta)
            continue
          }

          if (event.type === 'error') {
            streamErrorMessage = event.message || 'stream error'
          }
        }

        if (streamErrorMessage) {
          throw new Error(streamErrorMessage)
        }

        let replyText = streamedText.trim()
        if (!replyText) {
          const response = await agentStream.result.response
          replyText = extractAssistantText(response.messages as ModelMessage[])
        }

        await finalizeStream(sessionId, agentStream)
        await replyStream.complete(replyText)
        logger.info('channel 消息流式处理完成', { configId, sessionId })
        return
      }

      const response = await agentStream.result.response
      const replyText = extractAssistantText(response.messages as ModelMessage[])
      await finalizeStream(sessionId, agentStream)
      await adapter.sendReply(msg.externalChatId, replyText)
      logger.info('channel 消息处理完成', { configId, sessionId })
    } catch (err) {
      logger.error('channel 消息处理失败', { configId, error: serializeError(err) })

      if (replyStream) {
        await replyStream
          .fail('抱歉，处理消息时出错了。请稍后再试。')
          .catch(() => {})
        return
      }

      await adapter
        .sendReply(msg.externalChatId, '抱歉，处理消息时出错了。请稍后再试。')
        .catch(() => {})
    }
  }

  async function resolveSession(
    configId: number,
    platform: string,
    externalChatId: string,
    botId: number,
  ): Promise<number> {
    const existing = await prisma.channelMapping.findUnique({
      where: {
        channelConfigId_externalChatId: {
          channelConfigId: configId,
          externalChatId,
        },
      },
    })

    if (existing) return existing.sessionId

    const session = await sessionManager.getOrCreate(undefined, botId, platform)
    await prisma.channelMapping.create({
      data: {
        channelConfigId: configId,
        externalChatId,
        sessionId: session.id,
      },
    })

    logger.info('创建 channel-session 映射', {
      configId,
      platform,
      externalChatId,
      sessionId: session.id,
    })
    return session.id
  }

  function createAdapter(platform: string, config: Record<string, any>): ChannelAdapter | null {
    if (platform === 'feishu') {
      return createFeishuAdapter(config as FeishuConfig)
    }
    return null
  }

  return {
    startAll,
    startOne,
    stopOne,
    stopAll,
  }
}

function createNotInitializedManager(): ChannelManager {
  const error = new Error('channelManager 尚未初始化，请先调用 initChannelManager')
  return {
    async startAll() {
      throw error
    },
    async startOne(_configId, _platform, _config, _botId) {
      throw error
    },
    async stopOne() {
      throw error
    },
    async stopAll() {
      throw error
    },
  }
}

export let channelManager: ChannelManager = createNotInitializedManager()

export function initChannelManager(prisma: AppPrismaClient): ChannelManager {
  channelManager = createChannelManager(prisma)
  return channelManager
}
