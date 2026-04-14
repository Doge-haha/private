/**
 * @openclaw/session-task-persistence
 *
 * Auto-registers subagent tasks via polling runs.sqlite.
 * Polls every 30s. On terminal transitions, writes session summary to memory/.
 * Every 10 polls, evicts old completed/failed task files (LRU, keep latest 50, >24h).
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry"
import { createTaskPollingService } from "./polling-service.js"
import { listSessionTasks, type SessionTask } from "./task-store.js"

export type { SessionTask, TaskStatus, TaskType } from "./task-store.js"
export { appendTaskOutput, readTaskOutput, updateToolActivity } from "./output-manager.js"

let pollingService: ReturnType<typeof createTaskPollingService> | null = null

export default definePluginEntry({
  id: "session-task-persistence",
  name: "Session Task Persistence",
  description:
    "Polling-based subagent task auto-registration. Scans runs.sqlite every 30s to " +
    "capture subagent sessions. Writes session summaries to memory/ on completion. " +
    "LRU-evicts old task files every 10 polls.",

  register(api) {
    // Start polling service (includes memory writes + LRU eviction)
    pollingService = createTaskPollingService(30_000)
    pollingService.start()

    // Hook: subagent_spawned (PI runtime only, best-effort)
    api.registerHook("subagent_spawned", async (event) => {
      const { childSessionKey, agentId, label, mode } = event
      try {
        const taskType =
          agentId === "research" ? "research"
          : agentId === "dev" ? "verification"
          : mode === "run" && !label ? "simple"
          : "local_agent"
        const parentSessionId = event.requester?.sessionKey ?? "unknown"
        const { registerSessionTask } = await import("./task-store.js")
        const task = await registerSessionTask(
          parentSessionId,
          childSessionKey,
          label ?? `Task ${childSessionKey}`,
          taskType
        )
        console.log(`[session-task-persistence] Task registered: ${task.id} (hook)`)
      } catch (err) {
        console.error(`[session-task-persistence] hook register error:`, err)
      }
    })

    // Hook: subagent_ended
    api.registerHook("subagent_ended", async (event) => {
      const { targetSessionKey, outcome, error, endedAt } = event
      try {
        const tasks = await listSessionTasks()
        const task = tasks.find((t: SessionTask) => t.childSessionKey === targetSessionKey)
        if (!task) return
        const statusMap: Record<string, "completed" | "failed" | "killed"> = {
          ok: "completed", error: "failed",
          timeout: "failed", killed: "killed",
          reset: "killed", deleted: "killed",
        }
        const status = statusMap[outcome ?? ""] ?? "killed"
        const updates: Partial<SessionTask> = { status }
        if (endedAt) updates.completedAt = endedAt
        if (error) updates.error = { message: error }
        const { updateSessionTaskState } = await import("./task-store.js")
        await updateSessionTaskState(task.id, task.parentSessionId, updates)
        console.log(`[session-task-persistence] Task ${task.id} updated: ${status} (hook)`)
      } catch (err) {
        console.error(`[session-task-persistence] hook update error:`, err)
      }
    })
  },
})
