export type CronSchedule = { type: 'cron'; expression: string; timezone?: string }
export type EverySchedule = { type: 'every'; intervalMs: number }
export type AtSchedule = { type: 'at'; timestamp: number }

export type JobSchedule = CronSchedule | EverySchedule | AtSchedule

export type InternalAction = { type: 'internal'; handler: string }
export type AgentTurnAction = {
  type: 'agent-turn'
  prompt: string
  /** 运行 agent 时复用的会话 ID */
  sessionId?: number
  /** 执行完成后将结果投递到的目标 sessionId，通过查 channelMapping 表找到对应 channel */
  deliverySessionId?: number
}
export type ChannelMessageAction = { type: 'channel-message'; channelConfigId: number; externalChatId: string; message: string }

export type JobAction = InternalAction | AgentTurnAction | ChannelMessageAction

export interface ScheduledJob {
  id: string
  botId: number
  name: string
  enabled: boolean
  schedule: JobSchedule
  action: JobAction
  config?: {
    deleteAfterRun?: boolean
  }
  createdAt: string
  lastRunAt?: string
  lastRunStatus?: 'success' | 'failed'
  nextRunAt?: string
}

export type InternalHandler = (job: ScheduledJob) => Promise<void>

export interface SchedulerDeps {
  runAgentTurn?: (botId: number, prompt: string, sessionId?: number) => Promise<string>
  sendChannelMessage?: (configId: number, externalChatId: string, text: string) => Promise<void>
  /** 将文本投递到指定 session 对应的 channel（由 server.ts 查 channelMapping 表实现） */
  sendToSession?: (sessionId: number, text: string) => Promise<void>
}
