import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

// ============================================================
// 数据结构
// ============================================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed'
export type TaskType = 'local_agent' | 'research' | 'verification' | 'simple'

export interface ToolActivity {
  toolName: string
  input: Record<string, unknown>
  activityDescription: string
  isSearch: boolean
  isRead: boolean
}

export interface SessionTask {
  id: string
  parentSessionId: string
  childSessionId: string
  status: TaskStatus
  taskType: TaskType
  description: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  outputFile: string
  outputOffset: number
  outputSize: number
  progress: {
    toolUseCount: number
    latestInputTokens: number
    cumulativeOutputTokens: number
    recentActivities: ToolActivity[]
  }
  error?: { message: string; stack?: string }
}

// ============================================================
// 存储路径
// ============================================================

function getOpenClawTasksDir(): string {
  return path.join(process.env.HOME ?? '/Users/huahaha', '.openclaw', 'tasks')
}

export function getSessionTaskOutputPath(taskId: string, parentSessionId: string): string {
  return path.join(getOpenClawTasksDir(), parentSessionId, `${taskId}.log`)
}

export function getTaskMetaPath(taskId: string, parentSessionId: string): string {
  return path.join(getOpenClawTasksDir(), parentSessionId, `${taskId}.meta.json`)
}

// ============================================================
// 核心操作
// ============================================================

export async function initSessionTaskOutput(taskId: string, parentSessionId: string): Promise<string> {
  const dir = path.join(getOpenClawTasksDir(), parentSessionId)
  const file = getSessionTaskOutputPath(taskId, parentSessionId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(file, '', 'utf-8')
  return file
}

export async function registerSessionTask(
  parentSessionId: string,
  childSessionId: string,
  description: string,
  taskType: TaskType
): Promise<SessionTask> {
  const id = randomUUID()
  const outputFile = await initSessionTaskOutput(id, parentSessionId)

  const task: SessionTask = {
    id,
    parentSessionId,
    childSessionId,
    status: 'pending',
    taskType,
    description,
    createdAt: Date.now(),
    outputFile,
    outputOffset: 0,
    outputSize: 0,
    progress: {
      toolUseCount: 0,
      latestInputTokens: 0,
      cumulativeOutputTokens: 0,
      recentActivities: [],
    },
  }

  const metaPath = getTaskMetaPath(id, parentSessionId)
  await fs.writeFile(metaPath, JSON.stringify(task, null, 2), 'utf-8')
  return task
}

export async function updateSessionTaskState(
  taskId: string,
  parentSessionId: string,
  updates: Partial<SessionTask>
): Promise<void> {
  const metaPath = getTaskMetaPath(taskId, parentSessionId)
  const existing = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as SessionTask
  const updated = { ...existing, ...updates }
  await fs.writeFile(metaPath, JSON.stringify(updated, null, 2), 'utf-8')
}

export async function getSessionTask(
  taskId: string,
  parentSessionId: string
): Promise<SessionTask | null> {
  try {
    const metaPath = getTaskMetaPath(taskId, parentSessionId)
    return JSON.parse(await fs.readFile(metaPath, 'utf-8')) as SessionTask
  } catch {
    return null
  }
}

export async function listSessionTasks(
  parentSessionId?: string
): Promise<SessionTask[]> {
  const tasksDir = getOpenClawTasksDir()
  try {
    const entries = await fs.readdir(tasksDir, { withFileTypes: true })
    const sessions = entries.filter(e => e.isDirectory())
    const results: SessionTask[] = []

    for (const session of sessions) {
      if (parentSessionId && session.name !== parentSessionId) continue
      const sessionDir = path.join(tasksDir, session.name)
      const files = await fs.readdir(sessionDir)
      const metaFiles = files.filter(f => f.endsWith('.meta.json'))

      for (const metaFile of metaFiles) {
        try {
          const content = await fs.readFile(path.join(sessionDir, metaFile), 'utf-8')
          results.push(JSON.parse(content) as SessionTask)
        } catch {}
      }
    }
    return results
  } catch {
    return []
  }
}
