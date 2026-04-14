/**
 * Memory Integration for completed tasks
 *
 * 当 session 完成后，将关键信息摘要写入：
 * memory/types/project/session-{id}.md
 *
 * 从 session 文件中提取真实 token 统计数据（通过 sessions.json 映射）。
 */

import { readFileSync, existsSync } from "node:fs"
import path from "path"
import type { SessionTask } from "./task-store.js"

const MEMORY_DIR = path.join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "workspace", "memory", "types", "project"
)

const SESSIONS_JSON = path.join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "agents", "main", "sessions", "sessions.json"
)

/**
 * 通过 sessions.json 将 childSessionKey 解析为 session 文件路径。
 * sessions.json 的 key 是完整的 session key，value.sessionId 是 session UUID。
 */
function getSessionFilePath(childSessionKey: string): string | null {
  try {
    if (!childSessionKey) return null

    const sessionsData = JSON.parse(readFileSync(SESSIONS_JSON, "utf-8"))
    const entry = sessionsData[childSessionKey]
    if (!entry || !entry.sessionId) return null

    return path.join(
      process.env.HOME ?? "/Users/huahaha",
      ".openclaw", "agents", "main", "sessions",
      `${entry.sessionId}.jsonl`
    )
  } catch {
    return null
  }
}

/**
 * 从 session 文件中读取 token 使用统计。
 * 读取最后一个包含 usage 的 assistant message。
 */
function readTokenStatsFromSession(childSessionKey: string): {
  input: number
  output: number
} {
  const sessionPath = getSessionFilePath(childSessionKey)
  if (!sessionPath) return { input: 0, output: 0 }

  try {
    if (!existsSync(sessionPath)) return { input: 0, output: 0 }

    const content = readFileSync(sessionPath, "utf-8")
    const lines = content.split("\n")

    // Scan in reverse to find the most recent usage
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      if (!line) continue
      try {
        const obj = JSON.parse(line)
        const msg = obj.message ?? obj
        const usage = msg?.usage
        if (usage && (usage.input > 0 || usage.output > 0)) {
          return {
            input: usage.input ?? 0,
            output: usage.output ?? 0,
          }
        }
      } catch {}
    }
  } catch {}

  return { input: 0, output: 0 }
}

export async function writeSessionMemory(task: SessionTask): Promise<void> {
  // Extract real token stats from session file
  const tokenStats = readTokenStatsFromSession(task.childSessionKey ?? "")

  try {
    const fs = await import("node:fs/promises")

    // Ensure directory exists
    await fs.mkdir(MEMORY_DIR, { recursive: true })

    const fileName = `session-${task.id}.md`
    const filePath = path.join(MEMORY_DIR, fileName)

    // Build summary from description (first line)
    const firstLine = task.description.split("\n")[0].replace(/^\[[^\]]+\]\s*/, "").trim()
    const summary = firstLine || `Task ${task.id.slice(0, 8)}`

    const activities = task.progress.recentActivities
      .slice(0, 5)
      .map((a) => `[${a.toolName}] ${a.activityDescription}`)
      .join("\n")

    const content = [
      `---`,
      `name: session-${task.id.slice(0, 8)}`,
      `description: ${summary}`,
      `type: project`,
      `created: ${new Date(task.createdAt).toISOString()}`,
      `session_id: ${task.childSessionKey ?? task.id}`,
      `status: ${task.status}`,
      `task_type: ${task.taskType}`,
      `---`,
      ``,
      `## 摘要`,
      summary,
      ``,
      `## Token 统计`,
      `| 指标 | 值 |`,
      `|------|-----|`,
      `| Input Tokens | ${tokenStats.input.toLocaleString()} |`,
      `| Output Tokens | ${tokenStats.output.toLocaleString()} |`,
      `| Tool Uses | ${task.progress.toolUseCount} |`,
      ``,
      `## 关键活动`,
      activities || "(none)",
      ``,
      `## 错误信息`,
      task.error ? task.error.message : "(none)",
      ``,
      `## 元数据`,
      `- Created: ${new Date(task.createdAt).toISOString()}`,
      task.startedAt ? `- Started: ${new Date(task.startedAt).toISOString()}` : null,
      task.completedAt ? `- Completed: ${new Date(task.completedAt).toISOString()}` : null,
      `- Duration: ${task.startedAt && task.completedAt ? Math.round((task.completedAt - task.startedAt) / 1000) + "s" : "unknown"}`,
      `- Output Size: ${(task.outputSize / 1024).toFixed(1)} KB`,
    ]
      .filter(Boolean)
      .join("\n")

    await fs.writeFile(filePath, content, "utf-8")
    console.log(`[session-task-persistence][memory] wrote ${filePath} (tokens: in=${tokenStats.input}, out=${tokenStats.output})`)
  } catch (err) {
    console.error(`[session-task-persistence][memory] write error:`, err)
  }
}
