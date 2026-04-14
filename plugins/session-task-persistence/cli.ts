/**
 * CLI commands for session-task-persistence plugin.
 *
 * openclaw tasks list [--session SESSION_ID] [--status STATUS]
 * openclaw tasks show TASK_ID
 * openclaw tasks output TASK_ID [--offset N] [--limit N]
 */

import { listSessionTasks, getSessionTask } from "./task-store.js"
import { readTaskOutput } from "./output-manager.js"

// ============================================================
// Helpers
// ============================================================

function formatAge(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function statusEmoji(status: string): string {
  return { pending: "⏳", running: "🔄", completed: "✅", failed: "❌", killed: "🛑" }[status] ?? "?"
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 3) + "..."
}

// ============================================================
// Commands
// ============================================================

export function registerTaskCli(program: { command: (name: string) => any; option: (name: string, desc: string) => any }): void {
  const tasks = program.command("tasks").description("Session Task Persistence commands")

  // openclaw tasks list
  tasks
    .command("list")
    .description("List all registered tasks")
    .option("--session <id>", "Filter by parent session ID")
    .option("--status <status>", "Filter by status (pending/running/completed/failed/killed)")
    .option("--type <type>", "Filter by task type")
    .option("--json", "Output as JSON")
    .action(async (opts: {
      session?: string
      status?: string
      type?: string
      json?: boolean
    }) => {
      const all = await listSessionTasks(opts.session)

      const filtered = all.filter((t) => {
        if (opts.status && t.status !== opts.status) return false
        if (opts.type && t.taskType !== opts.type) return false
        return true
      })

      if (opts.json) {
        console.log(JSON.stringify(filtered, null, 2))
        return
      }

      if (filtered.length === 0) {
        console.log("No tasks found.")
        return
      }

      console.log(`\n  Total: ${filtered.length} task(s)\n`)
      console.log(
        "  ID  " +
        "  STATUS    " +
        "  TYPE          " +
        "  AGE      " +
        "  DESCRIPTION"
      )
      console.log("  " + "-".repeat(90))

      for (const t of filtered.slice(0, 50)) {
        const id = t.id.slice(0, 8)
        const status = `${statusEmoji(t.status)} ${t.status.padEnd(9)}`
        const type = t.taskType.padEnd(14)
        const age = formatAge(t.createdAt).padEnd(10)
        const desc = truncate(t.description.replace(/\n/g, " "), 50)
        console.log(`  ${id}  ${status}  ${type}  ${age}  ${desc}`)
      }

      if (filtered.length > 50) {
        console.log(`\n  ... and ${filtered.length - 50} more`)
      }
      console.log()
    })

  // openclaw tasks show
  tasks
    .command("show <taskId>")
    .description("Show full details of a task")
    .option("--json", "Output as JSON")
    .action(async (taskId: string, opts: { json?: boolean }) => {
      // Search all sessions for this task
      const all = await listSessionTasks()
      const task = all.find((t) => t.id === taskId || t.childSessionKey?.includes(taskId))

      if (!task) {
        console.error(`Task not found: ${taskId}`)
        process.exit(1)
      }

      if (opts.json) {
        console.log(JSON.stringify(task, null, 2))
        return
      }

      console.log("\n=== Task Details ===")
      console.log(`  ID:              ${task.id}`)
      console.log(`  Child Session:   ${task.childSessionKey}`)
      console.log(`  Parent Session:   ${task.parentSessionId}`)
      console.log(`  Status:          ${statusEmoji(task.status)} ${task.status}`)
      console.log(`  Type:            ${task.taskType}`)
      console.log(`  Description:     ${task.description.slice(0, 200).replace(/\n/g, " ")}`)
      console.log(`  Created:         ${new Date(task.createdAt).toISOString()} (${formatAge(task.createdAt)})`)
      if (task.startedAt) console.log(`  Started:         ${new Date(task.startedAt).toISOString()}`)
      if (task.completedAt) console.log(`  Completed:       ${new Date(task.completedAt).toISOString()}`)
      console.log(`  Output File:     ${task.outputFile}`)
      console.log(`  Output Size:     ${task.outputSize} bytes`)
      console.log(`  Tool Uses:       ${task.progress.toolUseCount}`)
      if (task.error) console.log(`  Error:           ${task.error.message}`)

      console.log("\n  Recent Activities:")
      if (task.progress.recentActivities.length === 0) {
        console.log("    (none)")
      } else {
        for (const a of task.progress.recentActivities) {
          console.log(`    - [${a.toolName}] ${a.activityDescription}`)
        }
      }
      console.log()
    })

  // openclaw tasks output
  tasks
    .command("output <taskId>")
    .description("Read task output (supports offset for tail-like reading)")
    .option("--offset <n>", "Starting byte offset", (v) => parseInt(v), 0)
    .option("--limit <n>", "Max bytes to read", (v) => parseInt(v), 0)
    .option("--tail <n>", "Show last N lines", (v) => parseInt(v), 0)
    .option("--json", "Output as JSON")
    .action(async (taskId: string, opts: { offset?: number; limit?: number; tail?: number; json?: boolean }) => {
      const all = await listSessionTasks()
      const task = all.find((t) => t.id === taskId || t.childSessionKey?.includes(taskId))

      if (!task) {
        console.error(`Task not found: ${taskId}`)
        process.exit(1)
      }

      const result = await readTaskOutput(task.id, task.parentSessionId, opts.offset ?? 0, opts.limit)

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }

      if (!result.content) {
        console.log("(empty output)")
        return
      }

      let content = result.content
      if (opts.tail && opts.tail > 0) {
        const lines = content.split("\n")
        content = lines.slice(-opts.tail).join("\n")
      }

      process.stdout.write(content)
      if (!content.endsWith("\n")) process.stdout.write("\n")

      if (result.truncated) {
        console.error(`\n(warning: output truncated, ${result.newOffset} bytes total)`)
      }
    })
}
