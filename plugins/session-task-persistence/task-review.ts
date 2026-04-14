/**
 * Task Review — 任务复盘报告
 *
 * 扫描 memory/types/project/ 中的 session-{id}.md 文件，
 * 按日期分组，生成复盘报告。
 *
 * 关注：
 * - 完成率 / 失败率
 * - 平均耗时
 * - Token 消耗趋势
 * - 失败原因分析
 * - 关键活动摘要
 */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import path from "node:path"

const MEMORY_DIR = join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "workspace", "memory", "types", "project"
)

interface SessionMeta {
  name: string
  description: string
  type: string
  created: string
  session_id: string
  status: string
  task_type: string
  final_summary: string
  token_stats?: { input: number; output: number; tool_uses: number }
  key_activities: string[]
  error?: string
}

function parseFrontmatter(content: string): Record<string, string> {
  const fm: Record<string, string> = {}
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return fm
  for (const line of match[1].split("\n")) {
    const [k, ...v] = line.split(":")
    if (k && v.length) fm[k.trim()] = v.join(":").trim()
  }
  return fm
}

function parseContent(content: string): {
  tokenInput: number
  tokenOutput: number
  duration: string
  keyActivities: string[]
  error: string
} {
  let tokenInput = 0
  let tokenOutput = 0
  let duration = "unknown"
  let keyActivities: string[] = []
  let error = ""

  const inputMatch = content.match(/Input Tokens.*?\|\s*([\d,]+)/)
  const outputMatch = content.match(/Output Tokens.*?\|\s*([\d,]+)/)
  const durationMatch = content.match(/Duration:\s*(\d+s)/)
  const errorMatch = content.match(/## 错误信息\n([\s\S]*?)(?:##|$)/)
  const actsMatch = content.match(/## 关键活动\n([\s\S]*?)(?:##|$)/)

  if (inputMatch) tokenInput = parseInt(inputMatch[1].replace(",", ""))
  if (outputMatch) tokenOutput = parseInt(outputMatch[1].replace(",", ""))
  if (durationMatch) duration = durationMatch[1]
  if (errorMatch) error = errorMatch[1].replace(/\*\*/g, "").trim()
  if (actsMatch) {
    keyActivities = actsMatch[1]
      .split("\n")
      .filter((l: string) => l.includes("["))
      .map((l: string) => l.replace(/^\s*[-*]\s*/, "").trim())
      .slice(0, 3)
  }

  return { tokenInput, tokenOutput, duration, keyActivities, error }
}

function getDateFromFilename(filename: string): string {
  // session-uuid.md → extract date from "created" in frontmatter
  return ""
}

async function scanSessions(): Promise<{
  date: string
  sessions: Array<{
    filename: string
    status: string
    tokenInput: number
    tokenOutput: number
    duration: string
    error: string
    keyActivities: string[]
    description: string
  }>
}[]> {
  const files = readdirSync(MEMORY_DIR).filter(
    (f) => f.startsWith("session-") && f.endsWith(".md")
  )

  const byDate: Record<string, typeof sessions> = {}

  for (const file of files) {
    try {
      const content = readFileSync(join(MEMORY_DIR, file), "utf-8")
      const fm = parseFrontmatter(content)
      const { tokenInput, tokenOutput, duration, keyActivities, error } =
        parseContent(content)

      const date = fm.created
        ? new Date(fm.created).toISOString().slice(0, 10)
        : "unknown"

      if (!byDate[date]) byDate[date] = []
      byDate[date].push({
        filename: file,
        status: fm.status ?? "unknown",
        tokenInput,
        tokenOutput,
        duration,
        error,
        keyActivities,
        description: fm.description ?? file,
      })
    } catch {}
  }

  // Sort dates descending
  const dates = Object.keys(byDate).sort().reverse()
  return dates.map((date) => ({ date, sessions: byDate[date] }))
}

async function generateReview(days = 7): Promise<string> {
  const grouped = await scanSessions()
  const recent = grouped.slice(0, days)

  const lines: string[] = [
    `# 📋 任务复盘报告\n`,
  ]

  for (const group of recent) {
    const total = group.sessions.length
    const completed = group.sessions.filter((s) => s.status === "completed").length
    const failed = group.sessions.filter((s) => s.status === "failed").length
    const totalInput = group.sessions.reduce((sum, s) => sum + s.tokenInput, 0)
    const totalOutput = group.sessions.reduce((sum, s) => sum + s.tokenOutput, 0)
    const failedSessions = group.sessions.filter((s) => s.error && s.error !== "(none)")

    lines.push(`## 📅 ${group.date}`)
    lines.push(`| 指标 | 值 |`)
    lines.push(`|------|-----|`)
    lines.push(`| 完成 | ${completed} |`)
    lines.push(`| 失败 | ${failed} |`)
    lines.push(`| Input Tokens | ${totalInput.toLocaleString()} |`)
    lines.push(`| Output Tokens | ${totalOutput.toLocaleString()} |`)
    lines.push(``)

    if (failedSessions.length > 0) {
      lines.push(`### ❌ 失败分析`)
      for (const s of failedSessions.slice(0, 3)) {
        lines.push(`- **${s.description.slice(0, 50)}**`)
        lines.push(`  错误：${s.error.slice(0, 100)}`)
      }
      lines.push(``)
    }

    if (group.sessions.some((s) => s.keyActivities.length > 0)) {
      lines.push(`### 🔧 关键活动`)
      for (const s of group.sessions) {
        for (const act of s.keyActivities.slice(0, 2)) {
          lines.push(`- ${act}`)
        }
      }
      lines.push(``)
    }
  }

  lines.push(`---\n*由 session-task-persistence 自动生成*`)

  return lines.join("\n")
}

async function main() {
  const report = await generateReview(7)
  console.log(report)

  // Write to reports dir
  try {
    const { writeFileSync, mkdirSync } = require("node:fs")
    const today = new Date().toISOString().slice(0, 10)
    const reportsDir = join(
      process.env.HOME ?? "/Users/huahaha",
      ".openclaw", "workspace", "memory", "reports"
    )
    mkdirSync(reportsDir, { recursive: true })
    const reportPath = join(reportsDir, `${today}-task-review.md`)
    writeFileSync(reportPath, report, "utf-8")
    console.log(`\n[review] written to ${reportPath}`)
  } catch (err) {
    console.error("[review] write error:", err)
  }
}

main()
