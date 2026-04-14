/**
 * LRU Eviction for task outputs
 *
 * 定期清理 ~/.openclaw/tasks/ 下超过 maxAgeHours 且状态为 terminal 的旧 task 文件。
 * terminal = completed | failed | killed
 *
 * 策略：按 completedAt / endedAt 时间排序，保留最新的。
 */

import { DatabaseSync } from "node:sqlite"
import path from "path"
import { listSessionTasks } from "./task-store.js"
import type { SessionTask } from "./task-store.js"

const DB_PATH = path.join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "tasks", "runs.sqlite"
)
const TASKS_DIR = path.join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "tasks"
)

export interface EvictionStats {
  evictedFiles: number
  evictedDirs: number
  freedBytes: number
  errors: string[]
}

/**
 * 驱逐策略：
 * 1. 状态为 terminal（completed/failed/killed）且 endedAt > maxAgeHours
 * 2. 按 endedAt 升序（最老的先删）
 * 3. 保留最近的 maxKeep 个
 */
export async function evictOldTaskOutputs(
  maxAgeHours = 24,
  maxKeep = 50,
  dryRun = false
): Promise<EvictionStats> {
  const stats: EvictionStats = { evictedFiles: 0, evictedDirs: 0, freedBytes: 0, errors: [] }

  try {
    const fs = await import("node:fs/promises")
    const db = new DatabaseSync(DB_PATH, { readonly: true })

    // Get all terminal tasks from sqlite ordered by ended_at
    const rows = db
      .prepare<{ ended_at: number | null; task_id: string; status: string }>(`
        SELECT task_id, status, ended_at
          FROM task_runs
         WHERE status IN ('completed', 'failed', 'killed')
           AND ended_at IS NOT NULL
         ORDER BY ended_at ASC
      `)
      .all()

    const cutoff = Date.now() - maxAgeHours * 3600 * 1000

    // Count total terminal tasks
    const allTerminal = rows.filter((r) => r.ended_at !== null && r.ended_at < cutoff)

    // Keep the newest `maxKeep` regardless of age
    const toEvict = allTerminal.slice(0, Math.max(0, allTerminal.length - maxKeep))

    if (dryRun) {
      console.log(`[session-task-persistence][evict] DRY RUN: would evict ${toEvict.length} tasks`)
    }

    for (const row of toEvict) {
      try {
        // Find the meta.json to get parentSessionId
        const metaFiles = await fs.readdir(TASKS_DIR).catch(() => [])
        let parentSessionId: string | null = null

        for (const sessionDir of metaFiles) {
          const sessionPath = path.join(TASKS_DIR, sessionDir)
          try {
            const files = await fs.readdir(sessionPath)
            if (files.includes(`${row.task_id}.meta.json`)) {
              parentSessionId = sessionDir
              break
            }
          } catch {}
          if (parentSessionId) break
        }

        if (!parentSessionId) continue

        const dir = path.join(TASKS_DIR, parentSessionId)
        const logFile = path.join(dir, `${row.task_id}.log`)
        const metaFile = path.join(dir, `${row.task_id}.meta.json`)

        // Get file sizes before deleting
        let freed = 0
        try {
          const logStat = await fs.stat(logFile)
          freed += logStat.size
        } catch {}
        try {
          const metaStat = await fs.stat(metaFile)
          freed += metaStat.size
        } catch {}

        if (!dryRun) {
          await fs.unlink(logFile).catch(() => {})
          await fs.unlink(metaFile).catch(() => {})
        }

        stats.evictedFiles += 2
        stats.freedBytes += freed

        // Try to remove the session dir if empty
        try {
          const remaining = await fs.readdir(dir)
          if (remaining.length === 0) {
            if (!dryRun) await fs.rmdir(dir)
            stats.evictedDirs++
          }
        } catch {}
      } catch (err) {
        stats.errors.push(String(err))
      }
    }

    db.close()
  } catch (err) {
    stats.errors.push(String(err))
  }

  return stats
}
