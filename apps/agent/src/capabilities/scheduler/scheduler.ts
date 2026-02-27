import { randomUUID } from 'node:crypto'
import { CronExpressionParser } from 'cron-parser'
import { createLogger } from '@okon/shared'
import type { JobStore } from './job-store.js'
import type { ScheduledJob, InternalHandler, SchedulerDeps } from './types.js'

const logger = createLogger('scheduler')

export function createScheduler(store: JobStore, deps?: SchedulerDeps) {
  const jobs = new Map<string, ScheduledJob>()
  const timers = new Map<string, NodeJS.Timeout>()
  const handlers = new Map<string, InternalHandler>()
  let running = false

  function generateId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 8)
  }

  function computeNextRun(job: ScheduledJob): string | undefined {
    const { schedule } = job
    if (schedule.type === 'cron') {
      try {
        const interval = CronExpressionParser.parse(schedule.expression, {
          tz: schedule.timezone,
        })
        return interval.next().toISOString() ?? undefined
      } catch {
        logger.warn('无法解析 cron 表达式', { jobId: job.id, expression: schedule.expression })
        return undefined
      }
    }
    if (schedule.type === 'every') {
      return new Date(Date.now() + schedule.intervalMs).toISOString()
    }
    if (schedule.type === 'at') {
      return schedule.timestamp > Date.now()
        ? new Date(schedule.timestamp).toISOString()
        : undefined
    }
    return undefined
  }

  async function executeJob(job: ScheduledJob): Promise<void> {
    logger.info('执行定时任务', { jobId: job.id, name: job.name, actionType: job.action.type })

    try {
      const { action } = job

      if (action.type === 'internal') {
        const handler = handlers.get(action.handler)
        if (!handler) {
          throw new Error(`未注册的 internal handler: ${action.handler}`)
        }
        await handler(job)
      } else if (action.type === 'agent-turn') {
        if (!deps?.runAgentTurn) {
          throw new Error('agent-turn 执行器未注册')
        }
        const responseText = await deps.runAgentTurn(job.botId, action.prompt, action.sessionId)
        // 通过 sessionId 查 channelMapping 表，将响应投递到对应 channel
        if (action.deliverySessionId != null && deps.sendToSession) {
          await deps.sendToSession(action.deliverySessionId, responseText)
        }
      } else if (action.type === 'channel-message') {
        if (!deps?.sendChannelMessage) {
          throw new Error('channel-message 执行器未注册')
        }
        await deps.sendChannelMessage(action.channelConfigId, action.externalChatId, action.message)
      }

      job.lastRunStatus = 'success'
    } catch (err) {
      job.lastRunStatus = 'failed'
      logger.error('定时任务执行失败', { jobId: job.id, name: job.name, error: err })
    }

    job.lastRunAt = new Date().toISOString()

    if (job.config?.deleteAfterRun || job.schedule.type === 'at') {
      jobs.delete(job.id)
      timers.delete(job.id)
    } else {
      scheduleTimer(job)
    }

    await persist()
  }

  function scheduleTimer(job: ScheduledJob): void {
    const existing = timers.get(job.id)
    if (existing) clearTimeout(existing)

    if (!job.enabled) return

    const { schedule } = job
    let delayMs: number

    if (schedule.type === 'cron') {
      try {
        const interval = CronExpressionParser.parse(schedule.expression, {
          tz: schedule.timezone,
        })
        delayMs = interval.next().getTime() - Date.now()
      } catch {
        logger.warn('cron 表达式解析失败，跳过调度', { jobId: job.id })
        return
      }
    } else if (schedule.type === 'every') {
      delayMs = schedule.intervalMs
    } else {
      delayMs = schedule.timestamp - Date.now()
      if (delayMs <= 0) {
        executeJob(job)
        return
      }
    }

    if (delayMs <= 0) delayMs = 1000

    job.nextRunAt = new Date(Date.now() + delayMs).toISOString()

    const timer = setTimeout(() => {
      executeJob(job)
    }, delayMs)

    timer.unref()
    timers.set(job.id, timer)
  }

  async function persist(): Promise<void> {
    const allJobs = Array.from(jobs.values())
    await store.save(allJobs).catch((err) => {
      logger.error('持久化 jobs 失败', err)
    })
  }

  // ---- public API ----

  function registerHandler(name: string, handler: InternalHandler): void {
    handlers.set(name, handler)
  }

  async function start(): Promise<void> {
    if (running) return
    running = true

    const loaded = await store.load()
    for (const job of loaded) {
      jobs.set(job.id, job)
      scheduleTimer(job)
    }

    logger.info('调度器已启动', { jobCount: jobs.size })
  }

  async function stop(): Promise<void> {
    if (!running) return
    running = false

    for (const [, timer] of timers) {
      clearTimeout(timer)
    }
    timers.clear()

    await persist()
    logger.info('调度器已停止')
  }

  async function addJob(
    input: Omit<ScheduledJob, 'id' | 'createdAt' | 'nextRunAt' | 'lastRunAt' | 'lastRunStatus'>,
  ): Promise<ScheduledJob> {
    const job: ScheduledJob = {
      ...input,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }
    job.nextRunAt = computeNextRun(job)
    jobs.set(job.id, job)

    if (running) scheduleTimer(job)
    await persist()

    logger.info('添加定时任务', { jobId: job.id, name: job.name })
    return job
  }

  async function removeJob(jobId: string): Promise<void> {
    const timer = timers.get(jobId)
    if (timer) clearTimeout(timer)
    timers.delete(jobId)
    jobs.delete(jobId)
    await persist()
    logger.info('删除定时任务', { jobId })
  }

  async function toggleJob(jobId: string, enabled: boolean): Promise<void> {
    const job = jobs.get(jobId)
    if (!job) return
    job.enabled = enabled

    if (enabled && running) {
      scheduleTimer(job)
    } else {
      const timer = timers.get(jobId)
      if (timer) clearTimeout(timer)
      timers.delete(jobId)
    }

    await persist()
  }

  function listJobs(botId?: number): ScheduledJob[] {
    const all = Array.from(jobs.values())
    return botId != null ? all.filter((j) => j.botId === botId) : all
  }

  return {
    registerHandler,
    start,
    stop,
    addJob,
    removeJob,
    toggleJob,
    listJobs,
  }
}

export type Scheduler = ReturnType<typeof createScheduler>
