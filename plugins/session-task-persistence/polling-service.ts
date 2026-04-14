/**
 * Session Task Polling Service
 *
 * 每隔 N 秒扫描 ~/.openclaw/tasks/runs.sqlite 的 task_runs 表，
 * 将未注册到 ~/.openclaw/tasks/{parentId}/{taskId}.meta.json 的 subagent session 补录进来。
 *
 * 策略：
 * - 找到所有 child_session_key 非空的 subagent task runs
 * - 检查是否已在 meta.json 中注册
 * - 未注册的 → registerSessionTask
 * - 状态变更（running→completed/failed）→ updateSessionTaskState
 */

import { DatabaseSync } from "node:sqlite"
import path from "path"
import {
  registerSessionTask,
  updateSessionTaskState,
  getSessionTask,
  initSessionTaskOutput,
  getTaskMetaPath,
  type SessionTask,
  type TaskStatus,
  type TaskType,
} from "./task-store.js"
import { evictOldTaskOutputs } from "./evict.js"
import { writeSessionMemory } from "./memory-integration.js"

// ============================================================
// Config
// ============================================================

const POLL_INTERVAL_MS = 30_000       // 30 秒轮询一次
const DB_PATH = path.join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "tasks", "runs.sqlite"
)
const TASKS_DIR = path.join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "tasks"
)

// 状态映射: sqlite status → SessionTask status
const STATUS_MAP: Record<string, TaskStatus> = {
  pending:   "pending",
  running:   "running",
  completed: "completed",
  succeeded: "completed",   // sqlite 'succeeded' → our 'completed'
  failed:    "failed",
  killed:    "killed",
}

// ============================================================
// SQLite row shape (from schema)
// ============================================================

interface TaskRunRow {
  task_id:          string
  runtime:          string
  child_session_key: string | null
  owner_key:        string
  scope_kind:       string
  agent_id:         string | null
  label:            string | null
  task:             string
  status:           string
  created_at:       number
  started_at:       number | null
  ended_at:         number | null
  terminal_outcome: string | null
  error:            string | null
}

// ============================================================
// Polling logic
// ============================================================

const TERMINAL_STATUSES = new Set(["completed", "failed", "killed"])

let pollCount = 0
const EVICT_EVERY_N_POLLS = 10  // every 10 polls = 5 minutes at 30s interval

export function createTaskPollingService(intervalMs = POLL_INTERVAL_MS) {
  let timer: ReturnType<typeof setInterval> | null = null
  let db: DatabaseSync | null = null

  function getDb(): DatabaseSync {
    if (!db) {
      db = new DatabaseSync(DB_PATH, { readonly: true })
    }
    return db
  }

  async function pollOnce(): Promise<{ registered: number; updated: number }> {
    let registered = 0
    let updated = 0

    try {
      const database = getDb()

      // 找所有 subagent task runs（child_session_key 非空）
      const rows = database
        .prepare<TaskRunRow>(`
          SELECT *
            FROM task_runs
           WHERE child_session_key IS NOT NULL
             AND child_session_key != ''
        ORDER BY created_at DESC
           LIMIT 200
        `)
        .all()

      for (const row of rows) {
        if (!row.child_session_key) continue

        // parent session = owner_key
        const parentSessionId = row.owner_key

        // 检查是否已注册
        const existing = await getSessionTask(row.task_id, parentSessionId)

        if (!existing) {
          // 未注册 → 新建
          const taskType = mapAgentIdToTaskType(row.agent_id, row.label)
          const outputFile = await initSessionTaskOutput(row.task_id, parentSessionId)

          const task: SessionTask = {
            id: row.task_id,
            parentSessionId,
            childSessionKey: row.child_session_key,
            status: STATUS_MAP[row.status] ?? "pending",
            taskType,
            description: row.label ?? row.task,
            createdAt: row.created_at,
            startedAt: row.started_at ?? undefined,
            completedAt: row.ended_at ?? undefined,
            outputFile,
            outputOffset: 0,
            outputSize: 0,
            progress: {
              toolUseCount: 0,
              latestInputTokens: 0,
              cumulativeOutputTokens: 0,
              recentActivities: [],
            },
            error: row.error ? { message: row.error } : undefined,
          }

          const fs = await import("node:fs/promises")
          const metaPath = getTaskMetaPath(row.task_id, parentSessionId)
          await fs.writeFile(metaPath, JSON.stringify(task, null, 2), "utf-8")
          registered++
        } else {
          // 已注册 → 检查状态是否需要更新
          const newStatus = STATUS_MAP[row.status] ?? existing.status
          const becameTerminal =
            TERMINAL_STATUSES.has(newStatus) && !TERMINAL_STATUSES.has(existing.status)

          const needsUpdate =
            newStatus !== existing.status ||
            (row.ended_at && !existing.completedAt) ||
            (row.error && !existing.error)

          if (needsUpdate) {
            const updates: Partial<SessionTask> = {
              status: newStatus,
            }
            if (row.ended_at) updates.completedAt = row.ended_at
            if (row.error) updates.error = { message: row.error }

            await updateSessionTaskState(row.task_id, parentSessionId, updates)
            updated++

            // Memory integration: task just became terminal
            if (becameTerminal) {
              const updatedTask = { ...existing, ...updates }
              await writeSessionMemory(updatedTask)
            }
          }
        }
      }

      // Eviction: every N polls
      pollCount++
      if (pollCount % EVICT_EVERY_N_POLLS === 0) {
        const stats = await evictOldTaskOutputs(24, 50)
        if (stats.evictedFiles > 0) {
          console.log(
            `[session-task-persistence][evict] evicted ${stats.evictedFiles} files, ` +
            `${stats.evictedDirs} dirs, freed ${(stats.freedBytes / 1024).toFixed(1)} KB`
          )
        }
      }
    } catch (err) {
      console.error("[session-task-persistence][polling] poll error:", err)
    }

    return { registered, updated }
  }

  function start() {
    if (timer) return  // already running
    console.log(
      `[session-task-persistence][polling] started (interval=${intervalMs}ms, db=${DB_PATH})`
    )

    // Run immediately on start
    pollOnce()
      .then(({ registered, updated }) => {
        if (registered > 0 || updated > 0) {
          console.log(
            `[session-task-persistence][polling] initial scan: +${registered} registered, ~${updated} updated`
          )
        }
      })
      .catch(console.error)

    timer = setInterval(() => {
      pollOnce()
        .then(({ registered, updated }) => {
          if (registered > 0 || updated > 0) {
            console.log(
              `[session-task-persistence][polling] +${registered} registered, ~${updated} updated`
            )
          }
        })
        .catch(console.error)
    }, intervalMs)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
      db?.close()
      db = null
      console.log("[session-task-persistence][polling] stopped")
    }
  }

  return { pollOnce, start, stop }
}

// ============================================================
// Helpers
// ============================================================

function mapAgentIdToTaskType(
  agentId: string | null,
  label: string | null
): TaskType {
  if (agentId === "research") return "research"
  if (agentId === "dev") return "verification"
  if (label && label.startsWith("verify")) return "verification"
  return "local_agent"
}
