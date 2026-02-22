/** 平台无关的入站消息 */
export interface InboundMessage {
  /** 平台的会话/群组标识 */
  externalChatId: string
  /** 文本内容 */
  text: string
  /** 平台消息 ID（用于回复线程） */
  externalMessageId?: string
  /** 平台发送者 ID */
  senderId?: string
}

/** 平台无关的出站流式回复句柄 */
export interface OutboundReplyStream {
  /** 追加增量文本 */
  append(delta: string): Promise<void>
  /** 流式结束后，落最终文本 */
  complete(finalText: string): Promise<void>
  /** 流式失败时，落错误文本 */
  fail(errorText: string): Promise<void>
}

/** Channel 适配器接口 — 每个平台实现一次 */
export interface ChannelAdapter {
  readonly platform: string

  /** 启动连接，收到消息时调用 onMessage */
  start(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void>

  /** 可选：创建流式回复（平台不支持可不实现） */
  createReplyStream?(externalChatId: string): Promise<OutboundReplyStream>

  /** 向指定会话发送文本回复 */
  sendReply(externalChatId: string, text: string): Promise<void>

  /** 断开连接 */
  stop(): Promise<void>
}
