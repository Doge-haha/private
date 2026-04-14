/**
 * Graph Inject — 将 task-persistence 数据注入知识图谱
 *
 * 读取 graph.json，追加以下节点：
 *   - session-task-persistence Plugin
 *   - task-{date} 汇总节点
 *   - daily-token-report Skill
 *   - task-review Skill
 *   - task-session-{id} 节点（近期的）
 *
 * 用法: npx tsx graph-inject.ts
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const GRAPH_PATH = join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "workspace", "graphify-out", "graph.json"
)

const MEMORY_REPORTS_DIR = join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "workspace", "memory", "reports"
)

const TASKS_DIR = join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "tasks"
)

const MEMORY_PROJECT_DIR = join(
  process.env.HOME ?? "/Users/huahaha",
  ".openclaw", "workspace", "memory", "types", "project"
)

interface GraphNode {
  id: string
  label: string
  file_type?: string
  source_file?: string
  source_location?: string
  community?: number
  [key: string]: unknown
}

interface GraphEdge {
  source: string
  target: string
  label?: string
  type?: string
  weight?: number
  [key: string]: unknown
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  metadata?: Record<string, unknown>
}

function newId(prefix: string, suffix: string): string {
  return `${prefix}_${suffix.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

function readSessions(): Array<{
  id: string
  status: string
  date: string
  taskType: string
  tokenInput: number
  tokenOutput: number
  duration: string
}> {
  const sessions: ReturnType<typeof readSessions> = []
  try {
    const files = readdirSync(MEMORY_PROJECT_DIR).filter(
      (f) => f.startsWith("session-") && f.endsWith(".md")
    )
    for (const file of files.slice(-20)) {
      // recent 20
      try {
        const content = readFileSync(join(MEMORY_PROJECT_DIR, file), "utf-8")
        const createdMatch = content.match(/created:\s*([\d-T:.]+Z)/)
        const statusMatch = content.match(/status:\s*(\w+)/)
        const taskTypeMatch = content.match(/task_type:\s*(\w+)/)
        const inputMatch = content.match(/Input Tokens.*?\|\s*([\d,]+)/)
        const outputMatch = content.match(/Output Tokens.*?\|\s*([\d,]+)/)
        const durationMatch = content.match(/Duration:\s*(\d+s)/)

        if (!createdMatch) continue
        const date = new Date(createdMatch[1]).toISOString().slice(0, 10)
        const id = file.replace(".md", "")
        sessions.push({
          id,
          status: statusMatch?.[1] ?? "unknown",
          date,
          taskType: taskTypeMatch?.[1] ?? "local_agent",
          tokenInput: inputMatch ? parseInt(inputMatch[1].replace(",", "")) : 0,
          tokenOutput: outputMatch ? parseInt(outputMatch[1].replace(",", "")) : 0,
          duration: durationMatch?.[1] ?? "unknown",
        })
      } catch {}
    }
  } catch {}
  return sessions
}

function addDays(date: Date, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const raw = readFileSync(GRAPH_PATH, "utf-8")
  const graph: GraphData = JSON.parse(raw)

  const newNodes: GraphNode[] = []
  const newEdges: GraphEdge[] = []

  // 1. Plugin 根节点
  const pluginNode: GraphNode = {
    id: "session_task_persistence_plugin",
    label: "session-task-persistence Plugin",
    file_type: "plugin",
    source_file: "plugins/session-task-persistence/index.ts",
    source_location: "L1",
    community: 50,
  }
  if (!graph.nodes.find((n) => n.id === pluginNode.id)) {
    newNodes.push(pluginNode)
  }

  // 2. Capabilities
  const capabilities = [
    { id: "stp_daily_report", label: "daily-token-report Cron", type: "skill" },
    { id: "stp_task_review", label: "task-review Cron", type: "skill" },
    { id: "stp_polling", label: "Polling Scanner (30s)", type: "skill" },
    { id: "stp_memory_write", label: "Memory Auto-Archive", type: "skill" },
  ]

  for (const cap of capabilities) {
    if (!graph.nodes.find((n) => n.id === cap.id)) {
      newNodes.push({
        id: cap.id,
        label: cap.label,
        file_type: cap.type,
        source_file: "plugins/session-task-persistence/",
        source_location: "L1",
        community: 50,
      })
      newEdges.push({
        source: "session_task_persistence_plugin",
        target: cap.id,
        label: "provides",
        type: "uses",
        weight: 1,
      })
    }
  }

  // 3. 近期待办汇总节点（按天）
  const sessions = readSessions()
  const byDate: Record<string, typeof sessions> = {}
  for (const s of sessions) {
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  }

  const today = new Date().toISOString().slice(0, 10)
  for (let i = 0; i <= 6; i++) {
    const date = addDays(new Date(), -i)
    const daySessions = byDate[date] ?? []
    if (daySessions.length === 0) continue

    const completed = daySessions.filter((s) => s.status === "completed").length
    const failed = daySessions.filter((s) => s.status === "failed").length
    const totalInput = daySessions.reduce((sum, s) => sum + s.tokenInput, 0)
    const totalOutput = daySessions.reduce((sum, s) => sum + s.tokenOutput, 0)

    const nodeId = newId("stp_day", date)
    if (!graph.nodes.find((n) => n.id === nodeId)) {
      newNodes.push({
        id: nodeId,
        label: `Task Summary ${date}`,
        file_type: "task_summary",
        source_file: "memory/types/project/",
        source_location: date,
        community: 50,
        // custom fields for rendering
        task_date: date,
        task_completed: completed,
        task_failed: failed,
        token_input: totalInput,
        token_output: totalOutput,
      })
      newEdges.push({
        source: "session_task_persistence_plugin",
        target: nodeId,
        label: `sessions_on_${date}`,
        type: "contains",
        weight: completed + failed,
      })
    }
  }

  // 4. Task type nodes
  const taskTypes = [...new Set(sessions.map((s) => s.taskType))]
  for (const tt of taskTypes) {
    if (!tt || tt === "undefined") continue
    const nodeId = newId("task_type", tt)
    if (!graph.nodes.find((n) => n.id === nodeId)) {
      newNodes.push({
        id: nodeId,
        label: `TaskType: ${tt}`,
        file_type: "concept",
        source_file: "system",
        source_location: "L1",
        community: 50,
      })
      newEdges.push({
        source: "session_task_persistence_plugin",
        target: nodeId,
        label: "tracks",
        type: "manages",
        weight: 1,
      })
    }
  }

  // Apply changes
  graph.nodes.push(...newNodes)
  graph.edges.push(...newEdges)

  // Deduplicate by id
  const seenNodes = new Set<string>()
  graph.nodes = graph.nodes.filter((n) => {
    if (seenNodes.has(n.id)) return false
    seenNodes.add(n.id)
    return true
  })

  // Write back
  writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), "utf-8")

  console.log(`✅ Graph updated:`)
  console.log(`   +${newNodes.length} nodes`)
  console.log(`   +${newEdges.length} edges`)
  console.log(`   Total: ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
  console.log(`\nNew nodes:`)
  for (const n of newNodes) {
    console.log(`   ${n.id} (${n.label})`)
  }
}

main().catch(console.error)
