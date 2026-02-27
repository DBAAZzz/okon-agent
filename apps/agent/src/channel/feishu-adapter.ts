import * as lark from '@larksuiteoapi/node-sdk'
import { createLogger } from '@okon/shared'
import type { ChannelAdapter, InboundMessage, OutboundReplyStream } from './types.js'
import type { EventHandles } from '@larksuiteoapi/node-sdk'

const logger = createLogger('feishu-adapter')

type ReceiveMessageEvent = Parameters<NonNullable<EventHandles['im.message.receive_v1']>>[0]
type ReceiveMention = NonNullable<ReceiveMessageEvent['message']['mentions']>[number]

export interface FeishuConfig {
  appId: string
  appSecret: string
  /** 可选：用于严格判断是否 @ 了当前机器人 */
  botOpenId?: string
}

export function createFeishuAdapter(config: FeishuConfig): ChannelAdapter {
  const client = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
  })

  const eventDispatcher = new lark.EventDispatcher({})

  const wsClient = new lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    autoReconnect: true,
  })
  const botOpenId = config.botOpenId?.trim() ?? ''
  const streamPatchIntervalMs = 300
  const streamPlaceholder = '思考中...'
  const streamCardTitle = 'OKON Agent'
  const messageDedupWindowMs = 10 * 60 * 1000
  const maxDedupEntries = 5000
  const processedMessageIds = new Map<string, number>()

  if (!botOpenId) {
    logger.warn('Feishu 未配置 botOpenId，将按是否存在 @ 提及判断是否回复')
  }

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

  function pruneProcessedMessageIds(now: number): void {
    for (const [id, ts] of processedMessageIds) {
      if (now - ts > messageDedupWindowMs) {
        processedMessageIds.delete(id)
      }
    }

    while (processedMessageIds.size > maxDedupEntries) {
      const oldest = processedMessageIds.keys().next().value
      if (!oldest) break
      processedMessageIds.delete(oldest)
    }
  }

  function markMessageAsProcessing(messageId?: string): boolean {
    if (!messageId) return true

    const now = Date.now()
    pruneProcessedMessageIds(now)
    const lastSeenAt = processedMessageIds.get(messageId)
    if (lastSeenAt && now - lastSeenAt <= messageDedupWindowMs) {
      return false
    }

    processedMessageIds.set(messageId, now)
    return true
  }

  function extractTextFromContent(messageType: string, rawContent: string): string {
    try {
      const content = JSON.parse(rawContent) as any

      if (messageType === 'text') {
        return (content.text ?? '').trim()
      }

      if (messageType === 'post') {
        const postRoot = content.post ?? content
        const localePost = postRoot.zh_cn ?? Object.values(postRoot)[0]
        const rows = localePost?.content ?? []
        const textParts = rows.flatMap((row: any[]) =>
          row
            .filter((piece) => piece.tag === 'text' || piece.tag === 'a')
            .map((piece) => piece.text ?? ''),
        )

        return textParts.join('').trim()
      }
    } catch {
      return ''
    }

    return ''
  }

  function stripMentions(text: string, mentions?: ReceiveMention[]): string {
    let cleanText = text

    for (const mention of mentions ?? []) {
      cleanText = cleanText.replaceAll(mention.key, '')
    }

    // 兼容旧格式占位符
    cleanText = cleanText.replace(/@_user_\d+/g, '')
    return cleanText.trim()
  }

  function isMentioningBot(mentions?: ReceiveMention[]): boolean {
    if (!mentions?.length) return false

    if (!botOpenId) return true

    return mentions.some((mention) => mention.id?.open_id === botOpenId)
  }

  function shouldHandleIncomingMessage(mentions?: ReceiveMention[]): boolean {
    return isMentioningBot(mentions)
  }

  function buildTextContent(text: string): string {
    return JSON.stringify({ text })
  }

  function buildStreamingCardContent(text: string): string {
    const fallbackText = text.trim() || streamPlaceholder
    const card = JSON.parse(
      lark.messageCard.defaultCard({
        title: streamCardTitle,
        content: fallbackText,
      }),
    ) as Record<string, any>

    const config = card.config ?? {}
    card.config = {
      ...config,
      wide_screen_mode: true,
      update_multi: true,
    }

    return JSON.stringify(card)
  }

  async function createTextMessage(externalChatId: string, text: string): Promise<string> {
    const created = await client.im.v1.message.create({
      data: {
        receive_id: externalChatId,
        msg_type: 'text',
        content: buildTextContent(text),
      },
      params: {
        receive_id_type: 'chat_id',
      },
    })

    const messageId = created.data?.message_id
    if (!messageId) {
      throw new Error('飞书创建消息失败：未返回 message_id')
    }

    return messageId
  }

  async function createStreamingCardMessage(externalChatId: string, text: string): Promise<string> {
    const created = await client.im.v1.message.create({
      data: {
        receive_id: externalChatId,
        msg_type: 'interactive',
        content: buildStreamingCardContent(text),
      },
      params: {
        receive_id_type: 'chat_id',
      },
    })

    const messageId = created.data?.message_id
    if (!messageId) {
      throw new Error('飞书创建流式卡片失败：未返回 message_id')
    }

    return messageId
  }

  async function patchStreamingCardMessage(messageId: string, text: string): Promise<void> {
    await client.im.v1.message.patch({
      path: { message_id: messageId },
      data: {
        content: buildStreamingCardContent(text),
      },
    })
  }

  async function start(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void> {
    eventDispatcher.register({
      'im.message.receive_v1': async (data) => {
        try {
          const { message, sender } = data
          const messageType = message.message_type
          const senderType = sender.sender_type
          const chatType = message.chat_type
          const chatId = message.chat_id
          const messageId = message.message_id
          const mentions = message.mentions

          // 过滤 bot 消息
          if (senderType !== 'user') {
            logger.info('忽略非用户消息', { chatId, messageId, senderType })
            return
          }

          if (!markMessageAsProcessing(messageId)) {
            logger.info('忽略重复消息事件', { chatId, messageId })
            return
          }

          if (!shouldHandleIncomingMessage(mentions)) {
            logger.info('忽略未@机器人的消息', {
              chatId,
              messageId,
              chatType,
              mentionCount: mentions?.length ?? 0,
            })
            return
          }

          const text = extractTextFromContent(messageType, message.content)
          if (!text) {
            logger.info('忽略无法提取文本的消息', { chatId, messageId, messageType })
            return
          }

          const cleanText = stripMentions(text, mentions)
          if (!cleanText) {
            logger.info('忽略空文本消息（可能仅@机器人）', { chatId, messageId, messageType })
            return
          }

          logger.info('收到飞书消息', {
            chatId,
            messageId,
            text: cleanText,
          })

          const inboundMessage: InboundMessage = {
            externalChatId: chatId,
            text: cleanText,
            externalMessageId: messageId,
            senderId: sender.sender_id?.open_id,
          }

          // 飞书事件回调需快速返回，避免超时重推导致重复处理
          void onMessage(inboundMessage).catch((error) => {
            logger.error('异步处理飞书消息失败', {
              chatId,
              messageId,
              error: serializeError(error),
            })
          })
        } catch (err) {
          logger.error('处理飞书消息失败', { error: serializeError(err) })
        }
      },
    })

    await wsClient.start({ eventDispatcher })
    logger.info('飞书 WebSocket 连接已启动')
  }

  async function sendReply(externalChatId: string, text: string): Promise<void> {
    await createTextMessage(externalChatId, text)
  }

  async function createReplyStream(externalChatId: string): Promise<OutboundReplyStream> {
    const messageId = await createStreamingCardMessage(externalChatId, streamPlaceholder)

    let accumulatedText = ''
    let lastPatchedText = streamPlaceholder
    let lastPatchAt = Date.now()

    async function tryPatchLatest(force: boolean): Promise<void> {
      const now = Date.now()
      if (!force && now - lastPatchAt < streamPatchIntervalMs) return

      const nextText = (accumulatedText || streamPlaceholder).trim() || streamPlaceholder
      if (!force && nextText === lastPatchedText) return

      await patchStreamingCardMessage(messageId, nextText)
      lastPatchAt = Date.now()
      lastPatchedText = nextText
    }

    return {
      async append(delta: string): Promise<void> {
        if (!delta) return
        accumulatedText += delta

        try {
          await tryPatchLatest(false)
        } catch (error) {
          logger.warn('飞书流式 patch 失败（增量）', { messageId, error })
        }
      },
      async complete(finalText: string): Promise<void> {
        accumulatedText = finalText.trim() || '（无响应）'

        try {
          await tryPatchLatest(true)
        } catch (error) {
          logger.error('飞书流式 patch 失败（结束），回退为新消息发送', { messageId, error })
          await sendReply(externalChatId, accumulatedText)
        }
      },
      async fail(errorText: string): Promise<void> {
        const fallbackText = errorText.trim() || '抱歉，处理消息时出错了。请稍后再试。'
        accumulatedText = fallbackText

        try {
          await tryPatchLatest(true)
        } catch (error) {
          logger.error('飞书流式 patch 失败（异常），回退为新消息发送', { messageId, error })
          await sendReply(externalChatId, fallbackText)
        }
      },
    }
  }

  async function sendMessage(externalChatId: string, text: string): Promise<void> {
    await createTextMessage(externalChatId, text)
  }

  async function stop(): Promise<void> {
    wsClient.close()
    logger.info('飞书 WebSocket 连接已关闭')
  }

  return {
    platform: 'feishu',
    start,
    createReplyStream,
    sendReply,
    sendMessage,
    stop,
  }
}
