import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from '@okon/shared'
import type { ScheduledJob } from './types.js'

const logger = createLogger('job-store')
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(MODULE_DIR, '../../../data/scheduler')

export function createJobStore(dataDir = process.env.SCHEDULER_DIR || DEFAULT_DATA_DIR) {
  const jobsPath = path.join(dataDir, 'jobs.json')

  async function ensureDir(): Promise<void> {
    await fs.mkdir(dataDir, { recursive: true })
  }

  async function load(): Promise<ScheduledJob[]> {
    try {
      const raw = await fs.readFile(jobsPath, 'utf-8')
      return JSON.parse(raw) as ScheduledJob[]
    } catch {
      return []
    }
  }

  async function save(jobs: ScheduledJob[]): Promise<void> {
    await ensureDir()
    const tmp = `${jobsPath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(jobs, null, 2), 'utf-8')
    await fs.rename(tmp, jobsPath)
  }

  return { load, save }
}

export type JobStore = ReturnType<typeof createJobStore>
