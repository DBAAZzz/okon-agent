import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@okon/shared'
import type { Scheduler } from '../capabilities/scheduler/index.js'
import type { AgentTurnAction } from '../capabilities/scheduler/types.js'

const logger = createLogger('tool-scheduler')

const scheduleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cron'),
    expression: z.string().describe('cron 表达式，如 "0 9 * * *" 表示每天9点'),
    timezone: z.string().optional().describe('时区，如 "Asia/Shanghai"'),
  }),
  z.object({
    type: z.literal('every'),
    intervalMs: z.number().positive().describe('周期间隔毫秒数，用于重复执行'),
  }),
  z.object({
    type: z.literal('delay'),
    seconds: z.number().positive().describe('从现在起延迟多少秒后执行一次，适合"X分钟/小时后"等相对时间，如 60 表示 1 分钟后'),
  }),
  z.object({
    type: z.literal('at'),
    timestamp: z.number().positive().describe('精确的 Unix 毫秒时间戳，仅在你能确定目标时刻时使用（如"明天上午9点"）'),
  }),
])

const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('agent-turn'),
    prompt: z.string().describe(
      '触发时 agent 要执行的指令（不是用户原话）。' +
      '写成明确的执行命令，例如：' +
      '提醒类 → "直接告诉用户：该吃饭了！"；' +
      '查询类 → "查询明天北京天气，并给出穿衣建议"；' +
      '报告类 → "总结今日待办完成情况并汇报给用户"',
    ),
    sessionId: z.number().optional().describe('复用的会话 ID（留空则新建）'),
  }),
  z.object({
    type: z.literal('channel-message'),
    channelConfigId: z.number().describe('channel 配置 ID'),
    externalChatId: z.string().describe('外部会话 ID'),
    message: z.string().describe('发送的消息内容'),
  }),
  z.object({
    type: z.literal('internal'),
    handler: z.string().describe('内置处理器名称'),
  }),
])

export function buildSchedulerTools(
  getScheduler: () => Scheduler,
  getBotId: () => number,
  getSessionId?: () => number | undefined,
) {
  const scheduleTask = tool({
    description:
      '创建定时任务或提醒。支持 cron 周期任务、固定间隔任务、一次性定时任务。' +
      '在频道（如飞书）对话中创建 agent-turn 任务时，执行结果会自动回复到当前会话，无需任何额外配置。' +
      '对于"X分钟/小时后"等相对时间，请使用 delay 类型而非 at 类型。' +
      '重要：agent-turn 的 prompt 是触发时 agent 收到的指令，不是用户原话的复述。' +
      '写成可直接执行的命令，让 agent 到时间就能产出最终回复。',
    inputSchema: z.object({
      name: z.string().describe('任务名称'),
      schedule: scheduleSchema,
      action: actionSchema,
      deleteAfterRun: z.boolean().optional().describe('执行后自动删除（at/delay 类型默认自动删除）'),
    }),
    execute: async ({ name, schedule, action, deleteAfterRun }) => {
      const scheduler = getScheduler()

      // delay 类型由服务端计算时间戳，避免 LLM 不知道当前时间的问题
      const resolvedSchedule =
        schedule.type === 'delay'
          ? { type: 'at' as const, timestamp: Date.now() + schedule.seconds * 1000 }
          : schedule

      // agent-turn 任务自动注入当前 sessionId 作为 deliverySessionId
      let resolvedAction = action
      if (action.type === 'agent-turn') {
        const sid = getSessionId?.()
        if (sid != null) {
          resolvedAction = { ...action, deliverySessionId: sid } as AgentTurnAction
          logger.info('自动注入 deliverySessionId', { sessionId: sid })
        }
      }

      const job = await scheduler.addJob({
        botId: getBotId(),
        name,
        enabled: true,
        schedule: resolvedSchedule,
        action: resolvedAction,
        config: deleteAfterRun ? { deleteAfterRun } : undefined,
      })
      logger.info('通过 tool 创建定时任务', { jobId: job.id, name })
      return {
        success: true,
        jobId: job.id,
        name: job.name,
        nextRunAt: job.nextRunAt,
      }
    },
  })

  const listTasks = tool({
    description: '列出当前 bot 的所有定时任务',
    inputSchema: z.object({}),
    execute: async () => {
      const scheduler = getScheduler()
      const jobs = scheduler.listJobs(getBotId())
      return {
        count: jobs.length,
        jobs: jobs.map((j) => ({
          id: j.id,
          name: j.name,
          enabled: j.enabled,
          schedule: j.schedule,
          action: { type: j.action.type },
          nextRunAt: j.nextRunAt,
          lastRunAt: j.lastRunAt,
          lastRunStatus: j.lastRunStatus,
        })),
      }
    },
  })

  const cancelTask = tool({
    description: '取消（删除）一个定时任务',
    inputSchema: z.object({
      jobId: z.string().describe('要取消的任务 ID'),
    }),
    execute: async ({ jobId }) => {
      const scheduler = getScheduler()
      const jobs = scheduler.listJobs(getBotId())
      const exists = jobs.some((j) => j.id === jobId)
      if (!exists) {
        return { success: false, message: `任务 ${jobId} 不存在或不属于当前 bot` }
      }
      await scheduler.removeJob(jobId)
      logger.info('通过 tool 取消定时任务', { jobId })
      return { success: true, jobId }
    },
  })

  return { scheduleTask, listTasks, cancelTask }
}
