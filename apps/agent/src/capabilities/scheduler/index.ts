import { createJobStore } from './job-store.js'
import { createScheduler, type Scheduler } from './scheduler.js'
import type { SchedulerDeps } from './types.js'

export type { Scheduler } from './scheduler.js'
export type { ScheduledJob, InternalHandler, JobSchedule, JobAction, SchedulerDeps } from './types.js'

export let scheduler: Scheduler

export function initScheduler(deps?: SchedulerDeps): Scheduler {
  const store = createJobStore()
  scheduler = createScheduler(store, deps)
  return scheduler
}
