/**
 * Daily Token Report
 *
 * 扫描所有 meta.json，生成当日 token 消耗报表。
 * 设计为 cron 任务每日 23:00 执行。
 *
 * 用法:
 *   node --import=typescript --experimental-vm-modules daily-report.ts
 *   或直接 tsx daily-report.ts
 */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import path from "node:path"

const TASKS_DIR = join(process.env.HOME ?? "/Users/huahaha", ".openclaw", "tasks")
const MEMORY_DIR = join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "workspace", "memory", "types", "project"
)

interface TokenStats {
  input: number
  output: number
}

function getTasksDir(): string {
  return TASKS_DIR
}

function getMemoryDir(): string {
  return MEMORY_DIR
}

interface TaskMeta {
  id: string
  parentSessionId: string
  childSessionKey?: string
  status: string
  taskType: string
  description: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  progress?: {
    toolUseCount: number
    latestInputTokens: number
    cumulativeOutputTokens: number
  }
}

async function scanMetaFiles(): Promise<TaskMeta[]> {
  const tasks: TaskMeta[] = []
  const tasksDir = getTasksDir()

  let entries: string[] = []
  try {
    entries = readdirSync(tasksDir)
  } catch {
    return tasks
  }

  for (const entry of entries) {
    if (entry.startsWith(".")) continue
    const sessionPath = join(tasksDir, entry)
    let files: string[] = []
    try {
      files = readdirSync(sessionPath)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.endsWith(".meta.json")) continue
      try {
        const content = readFileSync(join(sessionPath, file), "utf-8")
        const meta = JSON.parse(content) as TaskMeta
        tasks.push(meta)
      } catch {
        continue
      }
    }
  }
  return tasks
}

function isToday(timestamp: number): boolean {
  const now = new Date()
  const d = new Date(timestamp)
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function formatNum(n: number): string {
  return n.toLocaleString()
}

async function generateReport(): Promise<string> {
  const tasks = await scanMetaFiles()
  const todayTasks = tasks.filter(
    (t) => t.completedAt && isToday(t.completedAt)
  )

  // Token stats
  let totalInput = 0
  let totalOutput = 0
  let completedCount = 0
  let failedCount = 0

  const byHour: Record<number, { input: number; output: number; count: number }> = {}

  for (const task of todayTasks) {
    if (task.status === "completed") completedCount++
    if (task.status === "failed") failedCount++

    const input = task.progress?.latestInputTokens ?? 0
    const output = task.progress?.cumulativeOutputTokens ?? 0
    totalInput += input
    totalOutput += output

    // Read real token stats from session file
    const realStats = readTokenStats(task.childSessionKey ?? "")
    totalInput += realStats.input
    totalOutput += realStats.output

    if (task.completedAt) {
      const hour = new Date(task.completedAt).getHours()
      if (!byHour[hour]) byHour[hour] = { input: 0, output: 0, count: 0 }
      byHour[hour].input += realStats.input
      byHour[hour].output += realStats.output
      byHour[hour].count++
    }
  }

  // Memory files today
  let memoryFilesToday = 0
  try {
    const files = readdirSync(getMemoryDir())
    for (const f of files) {
      if (!f.startsWith("session-") || !f.endsWith(".md")) continue
      const stat = { mtime: new Date(0) }
      try {
        const { mtime } = require("node:fs").statSync(join(getMemoryDir(), f))
        stat.mtime = mtime
        if (isToday(stat.mtime.getTime())) memoryFilesToday++
      } catch {}
    }
  } catch {}

  const date = new Date().toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  const lines: string[] = [
    `# 📊 每日 Task 报表 — ${date}`,
    ``,
    `## 概览`,
    ``,
    `| 指标 | 值 |`,
    `|------|-----|`,
    `| 完成 Task | ${completedCount} |`,
    `| 失败 Task | ${failedCount} |`,
    `| 总 Input Tokens | ${formatNum(totalInput)} |`,
    `| 总 Output Tokens | ${formatNum(totalOutput)} |`,
    `| Memory 文件写入 | ${memoryFilesToday} |`,
    ``,
    `## 按小时分布`,
    ``,
  ]

  if (Object.keys(byHour).length > 0) {
    lines.push(`| 时间段 | Task 数 | Input | Output |`)
    lines.push(`|--------|---------|-------|--------|`)
    for (let h = 0; h < 24; h++) {
      const slot = byHour[h]
      if (!slot) continue
      const label = `${String(h).padStart(2, "0")}:00`
      lines.push(
        `| ${label} | ${slot.count} | ${formatNum(slot.input)} | ${formatNum(slot.output)} |`
      )
    }
  } else {
    lines.push(`(当日暂无已完成 task)`)
  }

  lines.push(``)
  lines.push(`---\n*由 session-task-persistence 自动生成*`)

  return lines.join("\n")
}

function readTokenStats(childSessionKey: string): { input: number; output: number } {
  if (!childSessionKey) return { input: 0, output: 0 }

  try {
    const sessionsPath = join(
      process.env.HOME ?? "/Users/huahaha",
      ".openclaw", "agents", "main", "sessions", "sessions.json"
    )
    const sessionsData = JSON.parse(readFileSync(sessionsPath, "utf-8"))
    const entry = sessionsData[childSessionKey]
    if (!entry?.sessionId) return { input: 0, output: 0 }

    const jsonlPath = join(
      process.env.HOME ?? "/Users/huahaha",
      ".openclaw", "agents", "main", "sessions",
      `${entry.sessionId}.jsonl`
    )

    const content = readFileSync(jsonlPath, "utf-8")
    for (const line of content.split("\n").reverse()) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const obj = JSON.parse(trimmed)
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

async function main() {
  const report = await generateReport()
  console.log(report)

  // Write to memory
  try {
    const { writeFileSync, mkdirSync } = require("node:fs")
    const reportDir = join(getMemoryDir())
    mkdirSync(reportDir, { recursive: true })
    const today = new Date().toISOString().slice(0, 10)
    const reportPath = join(reportDir, `..`, `..`, `..`, `..`, `workspace`, `memory`, `reports`, `${today}-token-report.md`)
    // Simple: write to memory/reports/
    const reportsDir = join(
      process.env.HOME ?? "/Users/huahaha",
      ".openclaw", "workspace", "memory", "reports"
    )
    mkdirSync(reportsDir, { recursive: true })
    writeFileSync(join(reportsDir, `${today}-token-report.md`), report, "utf-8")
    console.log(`\n[report] written to ${reportsDir}/${today}-token-report.md`)
  } catch (err) {
    console.error("[report] write error:", err)
  }
}

main()
